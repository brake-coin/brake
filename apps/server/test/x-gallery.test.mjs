import assert from "node:assert/strict";
import test from "node:test";

import { galleryPosts, XGallery } from "../src/x-gallery.mjs";

test("X gallery keeps media posts and rejects unexpected media hosts", () => {
  const posts = galleryPosts([
    {
      id: "123",
      url: "https://x.com/STOPAICOIN/status/123",
      text: "AI won’t stop itself. https://t.co/media123",
      createdAt: "2026-08-23T20:00:00.000Z",
      media: [{ type: "photo", url: "https://pbs.twimg.com/media/example.jpg" }]
    },
    {
      id: "124",
      url: "https://x.com/STOPAICOIN/status/124",
      text: "unsafe",
      media: [{ type: "photo", url: "https://example.com/tracker.jpg" }]
    },
    {
      id: "125",
      url: "https://x.com/STOPAICOIN/status/125",
      text: "text only",
      media: []
    }
  ]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, "123");
  assert.equal(posts[0].text, "AI won’t stop itself.");
  assert.equal(posts[0].media[0].previewUrl, "https://pbs.twimg.com/media/example.jpg");
});

test("X gallery caches account reads", async () => {
  let calls = 0;
  const gallery = new XGallery({
    ttlMs: 60_000,
    xClient: {
      async userPosts() {
        calls += 1;
        return { user: { username: "STOPAICOIN" }, posts: [] };
      }
    }
  });
  assert.equal((await gallery.read()).cached, false);
  assert.equal((await gallery.read()).cached, true);
  assert.equal(calls, 1);
});
