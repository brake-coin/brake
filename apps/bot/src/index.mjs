import { readFile } from "node:fs/promises";

import { makeLaunchPost, makeTelegramLaunchPost } from "@brake/campaign";

const command = process.argv[2];

if (command !== "--dry-run") {
  console.error(
    "This command only previews campaign copy. Live X posting runs through the OAuth-connected server."
  );
  process.exitCode = 1;
} else {
  const projectUrl = new URL("../../../config/project.json", import.meta.url);
  const project = JSON.parse(await readFile(projectUrl, "utf8"));

  console.log("X PREVIEW\n");
  console.log(makeLaunchPost(project));
  console.log("\nTELEGRAM PREVIEW\n");
  console.log(makeTelegramLaunchPost(project));
}
