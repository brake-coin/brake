import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createBotConfig } from "../../bot/src/config.mjs";
import { OpenRouterClient } from "../../bot/src/openrouter.mjs";
import { BotStore } from "../../bot/src/store.mjs";
import { TelegramService } from "../../bot/src/telegram.mjs";
import { XClient } from "../../bot/src/x.mjs";
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
  publicTelegramCredentialStatus,
  TelegramCredentialStore,
  TelegramTokenError,
  verifyTelegramToken
} from "./telegram-credentials.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const publicDirectory = path.join(root, "dist");
const dataDirectory = process.env.STOPAI_DATA_DIR
  || process.env.BRAKE_DATA_DIR
  || path.join(root, ".data");
const port = Number.parseInt(process.env.PORT || "8080", 10);
const publicAppUrl = process.env.PUBLIC_APP_URL || `http://localhost:${port}`;
const adminPassword = process.env.STOPAI_ADMIN_PASSWORD
  || process.env.BRAKE_ADMIN_PASSWORD
  || "";
const secureCookies = publicAppUrl.startsWith("https://");
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || `${publicAppUrl},https://brake-coin.github.io`)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const credentialStore = new CredentialStore(path.join(dataDirectory, "openrouter.json"));
const telegramCredentialStore = new TelegramCredentialStore(
  path.join(dataDirectory, "telegram.json")
);
const adminSessions = new AdminSessionManager();
const environmentTelegramToken = process.env.TELEGRAM_BOT_TOKEN || "";
const storedTelegramCredential = await telegramCredentialStore.read();
const botConfig = createBotConfig({
  ...process.env,
  TELEGRAM_BOT_TOKEN: storedTelegramCredential?.token || environmentTelegramToken
});
const botStore = new BotStore(path.join(dataDirectory, "stopai-bot.json"));
const canonicalBytes = await readFile(
  path.join(publicDirectory, "assets/brake-emblem-meme-reference.png")
);
const canonicalReferenceDataUrl = `data:image/png;base64,${canonicalBytes.toString("base64")}`;
const openRouter = new OpenRouterClient({
  config: botConfig,
  credentialProvider: () => credentialStore.read()
});
const xClient = new XClient({
  config: botConfig,
  credentialProvider: async () => ({ accessToken: botConfig.xUserAccessToken })
});
const telegram = new TelegramService({
  config: botConfig,
  store: botStore,
  openRouter,
  xClient,
  canonicalReferenceDataUrl
});

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

class UserInputError extends Error {}

class FixedWindowRateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  take(key) {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }
}

const loginLimiter = new FixedWindowRateLimiter({ limit: 5, windowMs: 15 * 60 * 1_000 });
const telegramConnectLimiter = new FixedWindowRateLimiter({ limit: 10, windowMs: 60 * 60 * 1_000 });

async function telegramAdminStatus() {
  return {
    ...telegram.status(),
    ...publicTelegramCredentialStatus(
      await telegramCredentialStore.read(),
      Boolean(environmentTelegramToken)
    )
  };
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://openrouter.ai; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self' https://openrouter.ai; frame-ancestors 'none'"
  );
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendRedirect(response, location, extraHeaders = {}) {
  response.writeHead(303, { Location: location, "Cache-Control": "no-store", ...extraHeaders });
  response.end();
}

function requestOriginAllowed(request) {
  const origin = request.headers.origin;
  return !origin || allowedOrigins.has(origin);
}

function clientKey(request) {
  return String(request.headers["fly-client-ip"] || request.socket.remoteAddress || "unknown");
}

function getAdminSession(request) {
  return readCookie(request.headers.cookie, ADMIN_COOKIE);
}

function requireAdmin(request, response) {
  const token = getAdminSession(request);
  if (!adminSessions.isAuthenticated(token)) {
    sendJson(response, 401, { error: "Admin sign-in required." });
    return null;
  }
  return token;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new UserInputError("That request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UserInputError("Send valid JSON.");
  }
}

async function serveStatic(urlPath, response) {
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
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": relativePath.endsWith(".html") ? "no-cache" : "public, max-age=3600"
    });
    response.end(body);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function handleAdminApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    if (!requestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin not allowed." });
      return true;
    }
    if (!adminPassword) {
      sendJson(response, 503, { error: "Admin access is not configured yet." });
      return true;
    }
    if (!loginLimiter.take(clientKey(request))) {
      sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
      return true;
    }
    const body = await readJsonBody(request);
    if (!passwordMatches(body.password, adminPassword)) {
      sendJson(response, 401, { error: "Incorrect admin password." });
      return true;
    }
    const token = adminSessions.createSession();
    sendJson(response, 200, { ok: true }, {
      "Set-Cookie": adminCookie(token, { secure: secureCookies })
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/status") {
    if (!adminPassword) {
      sendJson(response, 503, { configured: false, error: "Admin access is not configured yet." });
      return true;
    }
    if (!requireAdmin(request, response)) return true;
    sendJson(response, 200, {
      configured: true,
      ...publicCredentialStatus(await credentialStore.read()),
      telegram: await telegramAdminStatus()
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/logout") {
    if (!requestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin not allowed." });
      return true;
    }
    adminSessions.destroySession(getAdminSession(request));
    sendJson(response, 200, { ok: true }, {
      "Set-Cookie": adminCookie("", { secure: secureCookies, maxAge: 0 })
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/openrouter/start") {
    if (!requestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin not allowed." });
      return true;
    }
    const sessionToken = requireAdmin(request, response);
    if (!sessionToken) return true;
    const transaction = createPkceTransaction();
    adminSessions.createOAuthTransaction({ sessionToken, ...transaction });
    const callbackUrl = new URL("/admin/openrouter/callback", publicAppUrl);
    callbackUrl.searchParams.set("state", transaction.state);
    sendJson(response, 200, {
      authorizationUrl: buildOpenRouterAuthorizationUrl({
        callbackUrl: callbackUrl.toString(),
        challenge: transaction.challenge
      })
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/openrouter/disconnect") {
    if (!requestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin not allowed." });
      return true;
    }
    if (!requireAdmin(request, response)) return true;
    await credentialStore.clear();
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/telegram/connect") {
    if (!requestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin not allowed." });
      return true;
    }
    if (!requireAdmin(request, response)) return true;
    if (!telegramConnectLimiter.take(clientKey(request))) {
      sendJson(response, 429, { error: "Too many Telegram connection attempts. Try later." });
      return true;
    }
    try {
      const body = await readJsonBody(request);
      const bot = await verifyTelegramToken({
        token: body.token,
        signal: AbortSignal.timeout(15_000)
      });
      await telegramCredentialStore.save({ token: body.token, bot });
      await telegram.configureToken(body.token);
      sendJson(response, 200, { ok: true, telegram: await telegramAdminStatus() });
    } catch (error) {
      if (error instanceof TelegramTokenError) {
        sendJson(response, error.status, { error: error.message });
      } else {
        console.error("Telegram connection failed", error.message);
        sendJson(response, 502, { error: "The bot token was verified but the bot could not start." });
      }
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/telegram/disconnect") {
    if (!requestOriginAllowed(request)) {
      sendJson(response, 403, { error: "Origin not allowed." });
      return true;
    }
    if (!requireAdmin(request, response)) return true;
    await telegramCredentialStore.clear();
    await telegram.configureToken(environmentTelegramToken);
    sendJson(response, 200, { ok: true, telegram: await telegramAdminStatus() });
    return true;
  }
  return false;
}

async function handleRequest(request, response) {
  setSecurityHeaders(response);
  let url;
  try {
    url = new URL(request.url, publicAppUrl);
  } catch {
    sendJson(response, 400, { error: "Invalid request URL." });
    return;
  }

  if (url.pathname.startsWith("/api/admin/") && await handleAdminApi(request, response, url)) return;

  if (request.method === "GET" && url.pathname === "/admin/") {
    sendRedirect(response, "/admin");
    return;
  }

  if (request.method === "GET" && url.pathname === "/admin/openrouter/callback") {
    const transaction = adminSessions.consumeOAuthTransaction({
      state: url.searchParams.get("state"),
      sessionToken: getAdminSession(request)
    });
    if (!transaction || !url.searchParams.get("code")) {
      sendRedirect(response, "/admin?oauth=expired");
      return;
    }
    try {
      const credential = await exchangeOpenRouterCode({
        code: url.searchParams.get("code"),
        verifier: transaction.verifier,
        signal: AbortSignal.timeout(30_000)
      });
      await credentialStore.save(credential);
      sendRedirect(response, "/admin?oauth=connected");
    } catch (error) {
      console.error("OpenRouter OAuth connection failed", error.message);
      sendRedirect(response, "/admin?oauth=failed");
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const telegramStatus = telegram.status();
    const ok = !botConfig.requireTelegram || telegramStatus.running;
    sendJson(response, ok ? 200 : 503, {
      ok,
      imageGeneration: "openrouter-oauth-pkce-byok",
      sharedOpenRouterConnected: Boolean(await credentialStore.read()),
      telegram: telegramStatus
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/memes") {
    sendJson(response, 410, {
      error: "Public shared image generation is retired. Connect your own OpenRouter account in the browser."
    });
    return;
  }

  if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
  sendJson(response, 404, { error: "Not found." });
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Unhandled request failure", error);
    if (!response.headersSent) {
      sendJson(response, error instanceof UserInputError ? 400 : 500, {
        error: error instanceof UserInputError ? error.message : "The STOPAI server hit a snag."
      });
    } else response.end();
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`STOPAI server listening on http://0.0.0.0:${port}`);
});

telegram.start().catch((error) => {
  console.error("Telegram startup failed", error);
  if (botConfig.requireTelegram) process.exitCode = 1;
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  await telegram.stop(signal);
  await new Promise((resolve) => server.close(resolve));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    shutdown(signal).finally(() => process.exit(process.exitCode || 0));
  });
}
