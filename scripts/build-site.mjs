import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await mkdir(path.join(output, "assets"), { recursive: true });
await mkdir(path.join(output, "config"), { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  await cp(path.join(root, "apps/site", file), path.join(output, file));
}

await cp(
  path.join(root, "assets/brake-emblem-simple.svg"),
  path.join(output, "assets/brake-emblem-simple.svg")
);
await cp(path.join(root, "config/project.json"), path.join(output, "config/project.json"));

console.log(`Built the BRAKE site at ${output}`);
