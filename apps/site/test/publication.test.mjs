import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MINT = "2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS";

test("homepage publishes the official live mint and verification links", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const project = JSON.parse(await readFile(
    new URL("../../../config/project.json", import.meta.url),
    "utf8"
  ));
  assert.equal(project.status, "live");
  assert.equal(project.cluster, "mainnet-beta");
  assert.equal(project.contractAddress, MINT);
  assert.match(html, new RegExp(MINT));
  assert.match(html, /View on Bags/);
  assert.match(html, /Verify on Solana/);
  assert.equal(project.links.x, "https://x.com/STOPAICOIN");
  assert.match(html, /https:\/\/x\.com\/STOPAICOIN/);
  assert.equal(project.links.telegram, "https://t.me/StopAiCoin");
  assert.equal(project.creatorFeeRecipient.handle, "@canadabirdie");
  assert.equal(project.creatorFeeRecipient.profileUrl, "https://x.com/canadabirdie");
  assert.match(html, /https:\/\/x\.com\/canadabirdie/);
  assert.match(html, /AI won’t stop itself/);
  assert.match(html, /Memes from the timeline/);
  assert.match(html, /Your memes/);
  assert.match(html, /https:\/\/t\.me\/StopAiCoin/);
  assert.equal((html.match(/id="idea-roll-button"/g) || []).length, 1);
  assert.match(html, /Style × theme × message/);
  assert.doesNotMatch(html, /data-prompt=/);
  assert.match(html, /stopai-social-preview\.png/);
});
