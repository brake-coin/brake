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
  assert.equal(project.creatorFeeRecipient.sharePercent, 100);
  assert.equal(project.creatorFeeRecipient.verificationUrl, project.links.bags);
  assert.match(html, /https:\/\/x\.com\/canadabirdie/);
  assert.match(html, /100% of the creator-fee share/);
  assert.match(html, /AI won’t stop itself/);
  assert.match(html, /Memes from the timeline/);
  assert.match(html, /Your memes/);
  assert.match(html, /https:\/\/t\.me\/StopAiCoin/);
  assert.equal((html.match(/id="idea-roll-button"/g) || []).length, 1);
  assert.match(html, />Roll a meme</);
  assert.match(html, /id="meme-idea"[\s\S]*readonly/);
  assert.match(html, /id="meme-style" name="style" type="hidden"/);
  assert.doesNotMatch(html, /id="idea-(style|theme|message)"/);
  assert.doesNotMatch(html, /data-prompt=/);
  assert.match(html, /styles\.css\?v=\d+-\d+/);
  assert.match(html, /app\.js\?v=\d+-\d+/);
  assert.match(html, /stopai-social-preview\.png/);
  assert.match(html, /<link rel="canonical" href="https:\/\/stopai-coin\.fly\.dev\/"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/stopai-coin\.fly\.dev\/"/);
  assert.match(html, /https:\/\/stopai-coin\.fly\.dev\/assets\/stopai-social-preview\.png/);
  assert.doesNotMatch(html, /brake-coin\.github\.io/);
  assert.match(html, /href="\.\/mint\.html"/);
});

test("mint discovery page publishes exact token facts and official links", async () => {
  const html = await readFile(new URL("../mint.html", import.meta.url), "utf8");
  assert.ok((html.match(new RegExp(MINT, "g")) || []).length >= 4);
  assert.match(html, /<link rel="canonical" href="https:\/\/stopai-coin\.fly\.dev\/mint\.html"/);
  assert.match(html, /Official Solana mainnet mint/);
  assert.match(html, /1,000,000,000 STOPAI/);
  assert.match(html, /Mint authority[\s\S]*Revoked/);
  assert.match(html, /Freeze authority[\s\S]*Revoked/);
  assert.match(html, /https:\/\/bags\.fm\//);
  assert.match(html, /https:\/\/explorer\.solana\.com\/address\//);
  assert.match(html, /https:\/\/x\.com\/STOPAICOIN/);
  assert.match(html, /https:\/\/t\.me\/StopAiCoin/);
  assert.match(html, /https:\/\/x\.com\/canadabirdie/);
  assert.match(html, /could lose all value/i);
  assert.match(html, /Distribution[\s\S]*and movement/);
  assert.match(html, /Largest token accounts/);
  assert.match(html, /Recent net flow map/);
  assert.match(html, /automated snapshot, not an independent audit/i);
  assert.match(html, /token-monitor\.js\?v=\d+-\d+/);
  assert.doesNotMatch(html, /brake-coin\.github\.io/);
});

test("crawler files point to the official domain and mint page", async () => {
  const [robots, sitemap] = await Promise.all([
    readFile(new URL("../robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../sitemap.xml", import.meta.url), "utf8")
  ]);
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Sitemap: https:\/\/stopai-coin\.fly\.dev\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/stopai-coin\.fly\.dev\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/stopai-coin\.fly\.dev\/mint\.html<\/loc>/);
});
