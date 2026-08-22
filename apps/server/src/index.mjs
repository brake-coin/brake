import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ADMIN_COOKIE,
  adminCookie,
  AdminSessionManager,
  passwordMatches,
  readCookie
} from "./admin-auth.mjs";
import { CredentialStore, publicCredentialStatus } from "./credentials.mjs";
import {
  buildOpenRouterAuthorizationUrl,
  createPkceTransaction,
  exchangeOpenRouterCode
} from "./openrouter-oauth.mjs";
import {
  FixedWindowRateLimiter,
  generateMeme,
  UpstreamError,
  UserInputError,
  validateMemeRequest
} from "./meme.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const publicDirectory = path.join(root, "dist");
const dataDirectory = process.env.BRAKE_DATA_DIR || path.join(root, ".data");
const port = readPositiveInteger(process.env.PORT, 8080);
const model = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";
const publicAppUrl = process.env.PUBLIC_APP_URL || `http://localhost:${port}`;
const adminPassword = process.env.BRAKE_ADMIN_PASSWORD || "";
const secureCookies = publicAppUrl.startsWith("https://");
const credentialStore = new CredentialStore(path.join(dataDirectory, "openrouter.json"));
const adminSessions = new AdminSessionManager();
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || `${publicAppUrl},https://brake-coin.github.io`)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const rateLimiter = new FixedWindowRateLimiter({
  limit: readPositiveInteger(process.env.MEME_RATE_LIMIT, 3),
  windowMs: readPositiveInteger(process.env.MEME_RATE_WINDOW_MS, 600_000)
});
const loginLimiter = new FixedWindowRateLimiter({ limit: 5, windowMs: 900_000 });
const maxConcurrent = readPositiveInteger(process.env.MEME_MAX_CONCURRENT, 2);
let activeGenerations = 0;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function readPositiveInteger(value, fallback) {
  const number = Number.parseInt(value ?? "", 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getRequestOrigin(req) {
  try {
    return req.headers.origin || new URL(req.url, publicAppUrl).origin;
  } catch {
    return "";
  }
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://*.fly.dev; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function sendRedirect(res, location, extraHeaders = {}) {
  res.writeHead(303, { Location: location, "Cache-Control": "no-store", ...extraHeaders });
  res.end();
}

function addCors(req, res) {
  const origin = getRequestOrigin(req);
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}

function isAllowedRequestOrigin(req) {
  const origin = req.headers.origin;
  return !origin || allowedOrigins.has(origin);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new UserInputError("That request is too large.");
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UserInputError("Send a valid JSON request.");
  }
}

function clientKey(req) {
  return (req.headers["fly-client-ip"] || req.socket.remoteAddress || "unknown").toString();
}

function getAdminSession(req) {
  return readCookie(req.headers.cookie, ADMIN_COOKIE);
}

function requireAdmin(req, res) {
  const token = getAdminSession(req);
  if (!adminSessions.isAuthenticated(token)) {
    sendJson(res, 401, { error: "Admin sign-in required." }, { "Cache-Control": "no-store" });
    return null;
  }
  return token;
}

let cachedReferenceImage;
async function getReferenceImage() {
  if (!cachedReferenceImage) {
    const bytes = await readFile(
      path.join(publicDirectory, "assets/brake-emblem-meme-reference.png")
    );
    cachedReferenceImage = `data:image/png;base64,${bytes.toString("base64")}`;
  }
  return cachedReferenceImage;
}

async function serveStatic(urlPath, res) {
  let relativePath;
  try {
    relativePath = urlPath === "/"
      ? "index.html"
      : urlPath === "/admin" || urlPath === "/admin/"
        ? "admin.html"
        : decodeURIComponent(urlPath).replace(/^\/+/, "");
  } catch {
    return false;
  }
  const filePath = path.resolve(publicDirectory, relativePath);
  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) return false;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": relativePath.endsWith(".html") ? "no-cache" : "public, max-age=3600"
    });
    res.end(body);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function handleAdminApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    if (!isAllowedRequestOrigin(req)) {
      sendJson(res, 403, { error: "Origin not allowed." });
      return true;
    }
    if (!adminPassword) {
      sendJson(res, 503, { error: "Admin access is not configured yet." });
      return true;
    }

    const rate = loginLimiter.take(clientKey(req));
    if (!rate.allowed) {
      sendJson(res, 429, { error: "Too many sign-in attempts. Try again later." });
      return true;
    }
    const body = await readJsonBody(req);
    if (!passwordMatches(body.password, adminPassword)) {
      sendJson(res, 401, { error: "Incorrect admin password." });
      return true;
    }

    const token = adminSessions.createSession();
    sendJson(
      res,
      200,
      { ok: true },
      { "Cache-Control": "no-store", "Set-Cookie": adminCookie(token, { secure: secureCookies }) }
    );
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/status") {
    if (!adminPassword) {
      sendJson(res, 503, { configured: false, error: "Admin access is not configured yet." });
      return true;
    }
    if (!requireAdmin(req, res)) return true;
    sendJson(
      res,
      200,
      { configured: true, ...publicCredentialStatus(await credentialStore.read()) },
      { "Cache-Control": "no-store" }
    );
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    if (!isAllowedRequestOrigin(req)) {
      sendJson(res, 403, { error: "Origin not allowed." });
      return true;
    }
    const token = getAdminSession(req);
    adminSessions.destroySession(token);
    sendJson(
      res,
      200,
      { ok: true },
      { "Set-Cookie": adminCookie("", { secure: secureCookies, maxAge: 0 }) }
    );
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/openrouter/start") {
    if (!isAllowedRequestOrigin(req)) {
      sendJson(res, 403, { error: "Origin not allowed." });
      return true;
    }
    const sessionToken = requireAdmin(req, res);
    if (!sessionToken) return true;

    const transaction = createPkceTransaction();
    adminSessions.createOAuthTransaction({ sessionToken, ...transaction });
    const callbackUrl = new URL("/admin/openrouter/callback", publicAppUrl);
    callbackUrl.searchParams.set("state", transaction.state);
    sendJson(
      res,
      200,
      {
        authorizationUrl: buildOpenRouterAuthorizationUrl({
          callbackUrl: callbackUrl.toString(),
          challenge: transaction.challenge
        })
      },
      { "Cache-Control": "no-store" }
    );
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/openrouter/disconnect") {
    if (!isAllowedRequestOrigin(req)) {
      sendJson(res, 403, { error: "Origin not allowed." });
      return true;
    }
    if (!requireAdmin(req, res)) return true;
    await credentialStore.clear();
    sendJson(res, 200, { ok: true }, { "Cache-Control": "no-store" });
    return true;
  }

  return false;
}

async function handleRequest(req, res) {
  setSecurityHeaders(res);
  addCors(req, res);

  let url;
  try {
    url = new URL(req.url, publicAppUrl);
  } catch {
    sendJson(res, 400, { error: "Invalid request URL." });
    return;
  }

  if (url.pathname.startsWith("/api/admin/") && await handleAdminApi(req, res, url)) return;

  if (req.method === "GET" && url.pathname === "/admin/") {
    sendRedirect(res, "/admin");
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/openrouter/callback") {
    const sessionToken = getAdminSession(req);
    const transaction = adminSessions.consumeOAuthTransaction({
      state: url.searchParams.get("state"),
      sessionToken
    });
    if (!transaction || !url.searchParams.get("code")) {
      sendRedirect(res, "/admin?oauth=expired");
      return;
    }

    try {
      const credential = await exchangeOpenRouterCode({
        code: url.searchParams.get("code"),
        verifier: transaction.verifier,
        signal: AbortSignal.timeout(30_000)
      });
      await credentialStore.save(credential);
      sendRedirect(res, "/admin?oauth=connected");
    } catch (error) {
      console.error("OpenRouter OAuth connection failed", error.message);
      sendRedirect(res, "/admin?oauth=failed");
    }
    return;
  }

  if (req.method === "OPTIONS" && url.pathname === "/api/memes") {
    if (!isAllowedRequestOrigin(req)) {
      sendJson(res, 403, { error: "Origin not allowed." });
      return;
    }
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, configured: Boolean(await credentialStore.read()) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/config/project.json") {
    const project = JSON.parse(
      await readFile(path.join(root, "config/project.json"), "utf8")
    );
    const configured = Boolean(await credentialStore.read());
    project.memeGenerator = {
      enabled: configured,
      apiUrl: configured ? "/api/memes" : null,
      modelLabel: model.includes("pro-image") ? "Nano Banana Pro" : "Nano Banana 2",
      statusMessage: configured
        ? "Generator online. Free pre-launch demo — never send tokens to use it."
        : "The image generator is waiting for its owner to connect OpenRouter."
    };
    sendJson(res, 200, project, { "Cache-Control": "no-store" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/memes") {
    let generationStarted = false;
    try {
      if (!isAllowedRequestOrigin(req)) {
        sendJson(res, 403, { error: "Origin not allowed." });
        return;
      }
      const credential = await credentialStore.read();
      if (!credential) throw new UpstreamError("The meme generator is not online yet.", 503);
      if (activeGenerations >= maxConcurrent) {
        throw new UpstreamError("The meme machine is busy. Try again in a moment.", 503);
      }

      const rate = rateLimiter.take(clientKey(req));
      res.setHeader("X-RateLimit-Remaining", rate.remaining);
      if (!rate.allowed) {
        sendJson(
          res,
          429,
          { error: "BRAKE check: try again in a few minutes." },
          { "Retry-After": rate.retryAfterSeconds }
        );
        return;
      }

      const request = validateMemeRequest(await readJsonBody(req));
      activeGenerations += 1;
      generationStarted = true;
      const result = await generateMeme({
        ...request,
        referenceImage: await getReferenceImage(),
        apiKey: credential.key,
        model,
        siteUrl: process.env.OPENROUTER_SITE_URL || publicAppUrl,
        appName: process.env.OPENROUTER_APP_NAME,
        signal: AbortSignal.timeout(90_000)
      });
      sendJson(res, 200, result, { "Cache-Control": "no-store" });
    } catch (error) {
      if (error instanceof UserInputError) sendJson(res, 400, { error: error.message });
      else if (error instanceof UpstreamError) {
        sendJson(res, error.status, { error: error.message });
      } else if (error.name === "TimeoutError") {
        sendJson(res, 504, { error: "The meme took too long. Try again." });
      } else {
        console.error("Meme generation failed", error);
        sendJson(res, 500, { error: "The meme machine hit a snag." });
      }
    } finally {
      if (generationStarted) activeGenerations = Math.max(0, activeGenerations - 1);
    }
    return;
  }

  if (req.method === "GET" && await serveStatic(url.pathname, res)) return;
  sendJson(res, 404, { error: "Not found." });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error("Unhandled request failure", error);
    if (!res.headersSent) sendJson(res, 500, { error: "The BRAKE server hit a snag." });
    else res.end();
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`BRAKE meme generator listening on http://0.0.0.0:${port}`);
});
