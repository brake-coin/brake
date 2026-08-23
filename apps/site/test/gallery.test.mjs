import assert from "node:assert/strict";
import test from "node:test";

import { MAX_GALLERY_ITEMS, sortGalleryItems } from "../gallery.js";

test("personal browser gallery keeps newest memes first and has a small fixed limit", () => {
  assert.equal(MAX_GALLERY_ITEMS, 12);
  assert.deepEqual(sortGalleryItems([
    { id: "old", createdAt: "2026-08-22T20:00:00.000Z" },
    { id: "new", createdAt: "2026-08-23T20:00:00.000Z" }
  ]).map((item) => item.id), ["new", "old"]);
});
