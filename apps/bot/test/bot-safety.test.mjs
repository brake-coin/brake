import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public project configuration keeps live posting disabled", async () => {
  const projectUrl = new URL("../../../config/project.json", import.meta.url);
  const project = JSON.parse(await readFile(projectUrl, "utf8"));
  assert.equal(project.livePostingEnabled, false);
  assert.equal(project.contractAddress, null);
});

test("Telegram bot source has no slash command handlers or command menu", async () => {
  const source = await readFile(new URL("../src/telegram.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.command\s*\(/);
  assert.doesNotMatch(source, /setMyCommands/);
  assert.match(source, /deleteMyCommands/);
});
