import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const siteFiles = new Map([
    ["/", "/apps/site/index.html"],
    ["/app.js", "/apps/site/app.js"],
    ["/openrouter.js", "/apps/site/openrouter.js"],
    ["/styles.css", "/apps/site/styles.css"]
  ]);
  const pathname = siteFiles.get(requestUrl.pathname) || requestUrl.pathname;
  const candidate = path.resolve(root, `.${pathname}`);

  if (!candidate.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(candidate);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(candidate)) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`STOPAI site: http://127.0.0.1:${port}`);
});
