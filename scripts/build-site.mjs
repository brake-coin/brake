import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });
await mkdir(path.join(output, "config"), { recursive: true });

for (const file of [
  "index.html",
  "mint.html",
  "admin.html",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
  "app.js",
  "admin.js",
  "openrouter.js",
  "token-monitor.js",
  "meme-ideas.js",
  "gallery.js"
]) {
  await cp(path.join(root, "apps/site", file), path.join(output, file));
}

await cp(
  path.join(root, "assets/brake-emblem-simple.svg"),
  path.join(output, "assets/brake-emblem-simple.svg")
);
await cp(
  path.join(root, "assets/brake-emblem-meme-reference.png"),
  path.join(output, "assets/brake-emblem-meme-reference.png")
);
await cp(
  path.join(root, "assets/brake-emblem-simple-final.png"),
  path.join(output, "assets/brake-emblem-simple-final.png")
);
await cp(
  path.join(root, "assets/stopai-social-preview.png"),
  path.join(output, "assets/stopai-social-preview.png")
);
await cp(path.join(root, "config/project.json"), path.join(output, "config/project.json"));

console.log(`Built the STOPAI site at ${output}`);
