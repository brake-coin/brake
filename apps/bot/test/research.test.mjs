import assert from "node:assert/strict";
import test from "node:test";

import { NewsResearchClient, parseNewsFeed, xPostResearchItem } from "../src/research.mjs";

const RSS = `
  <rss><channel>
    <item>
      <title><![CDATA[Frontier AI race draws new calls for a pause - Example News]]></title>
      <link>https://news.example/story</link>
      <pubDate>Sat, 22 Aug 2026 18:00:00 GMT</pubDate>
      <source>Example News</source>
      <description><![CDATA[Leaders debate <b>new safeguards</b>.]]></description>
    </item>
  </channel></rss>
`;

test("news research parses and cleans RSS items", () => {
  const items = parseNewsFeed(RSS, { now: new Date("2026-08-22T20:00:00.000Z") });
  assert.equal(items.length, 1);
  assert.equal(items[0].publisher, "Example News");
  assert.equal(items[0].summary, "Leaders debate new safeguards .");
  assert.equal(items[0].url, "https://news.example/story");
  assert.match(items[0].key, /^news:/);
});

test("news research rejects unsafe feed URLs and bounds results", async () => {
  const client = new NewsResearchClient({
    feedUrls: ["http://unsafe.example/feed", "https://news.example/feed"],
    fetchImpl: async () => new Response(RSS, {
      headers: { "content-type": "application/rss+xml" }
    }),
    now: () => new Date("2026-08-22T20:00:00.000Z")
  });
  assert.deepEqual(client.feedUrls, ["https://news.example/feed"]);
  assert.equal((await client.latest({ limit: 1 })).length, 1);
});

test("X research scoring rewards engagement and watched-source priority", () => {
  const base = {
    id: "1",
    text: "Pause the race",
    url: "https://x.com/example/status/1",
    createdAt: "2026-08-22T19:00:00.000Z",
    author: { username: "example" },
    metrics: { like_count: 100, retweet_count: 20 }
  };
  const normal = xPostResearchItem(base, { now: new Date("2026-08-22T20:00:00.000Z") });
  const watched = xPostResearchItem(base, { priority: 2, now: new Date("2026-08-22T20:00:00.000Z") });
  assert.equal(normal.key, "x:1");
  assert.ok(watched.score > normal.score);
});
