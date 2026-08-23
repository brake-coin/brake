import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public project configuration enables the authorized X posting service", async () => {
  const projectUrl = new URL("../../../config/project.json", import.meta.url);
  const project = JSON.parse(await readFile(projectUrl, "utf8"));
  assert.equal(project.livePostingEnabled, true);
  assert.equal(project.status, "live");
  assert.equal(project.contractAddress, "2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS");
  assert.equal(project.creatorFeeRecipient.handle, "@canadabirdie");
  assert.equal(project.creatorFeeRecipient.profileUrl, "https://x.com/canadabirdie");
  assert.equal(project.creatorFeeRecipient.sharePercent, 100);
  assert.equal(project.creatorFeeRecipient.scope, "Bags creator-fee distribution");
});

test("Telegram bot source has no slash command handlers or command menu", async () => {
  const source = await readFile(new URL("../src/telegram.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.command\s*\(/);
  assert.doesNotMatch(source, /setMyCommands/);
  assert.match(source, /deleteMyCommands/);
  assert.doesNotMatch(source, /hasExplicitXPostIntent|mustPrepareXPost|toolChoice/);
  assert.doesNotMatch(source, /hasMediaReviewConfirmation|needsMediaReviewConfirmation/);
  assert.doesNotMatch(source, /I confirm I reviewed this media/);
  assert.match(source, /mediaAltText\(media, args\.alt_text\)/);
  assert.match(source, /usageLimits\(this\.config, "x_post"\)/);
  assert.match(source, /usageLimits\(this\.config, "x_research"\)/);
  assert.match(source, /releaseUsage\(claim\.eventId\)/);
  assert.match(source, /ctx\.chat\?\.type === "private"/);
  assert.match(source, /#handlePrivateMessage/);
  assert.match(source, /Join the STOPAI group/);
});
