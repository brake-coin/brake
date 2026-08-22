import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const publicDirectory = path.join(root, "dist");
const port = Number.parseInt(process.env.PORT || "8080", 10);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://openrouter.ai; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self' https://openrouter.ai; frame-ancestors 'none'"
  );
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function serveStatic(urlPath, response) {
  let relativePath;
  try {
    relativePath = urlPath === "/"
      ? "index.html"
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

async function handleRequest(request, response) {
  setSecurityHeaders(response);
  let url;
  try {
    url = new URL(request.url, "http://localhost");
  } catch {
    sendJson(response, 400, { error: "Invalid request URL." });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, imageGeneration: "openrouter-oauth-pkce-byok" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/memes") {
    sendJson(response, 410, {
      error: "Shared image generation is retired. Connect your own OpenRouter account in the browser."
    });
    return;
  }

  if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
  sendJson(response, 404, { error: "Not found." });
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Unhandled request failure", error);
    if (!response.headersSent) sendJson(response, 500, { error: "The STOPAI server hit a snag." });
    else response.end();
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`STOPAI static server listening on http://0.0.0.0:${port}`);
});
