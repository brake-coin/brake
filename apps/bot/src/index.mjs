import { readFile } from "node:fs/promises";

import { makePrelaunchPost, makeTelegramPrelaunchPost } from "@brake/campaign";

const command = process.argv[2];

if (command !== "--dry-run") {
  console.error(
    "Live posting is intentionally disabled. Use --dry-run to preview approved messages."
  );
  process.exitCode = 1;
} else {
  const projectUrl = new URL("../../../config/project.json", import.meta.url);
  const project = JSON.parse(await readFile(projectUrl, "utf8"));

  console.log("X PREVIEW\n");
  console.log(makePrelaunchPost(project));
  console.log("\nTELEGRAM PREVIEW\n");
  console.log(makeTelegramPrelaunchPost(project));
}
