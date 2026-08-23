import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_IDEA_COMBINATIONS,
  normalizeMemeIdea,
  parseMemeDraft,
  serializeMemeDraft,
  rollLocalMemeIdea
} from "../meme-ideas.js";

test("offline idea rolls combine a large three-part corpus", () => {
  assert.ok(LOCAL_IDEA_COMBINATIONS >= 10_000);
  const first = rollLocalMemeIdea(() => 0);
  assert.equal(first.style, "bootleg action-movie poster");
  assert.equal(first.memeStyle, "poster");
  assert.match(first.theme, /AI lab/i);
  assert.equal(first.message, "More speed is not more wisdom");
  assert.match(first.idea, /^A bootleg action-movie poster where/);
  assert.match(first.idea, /The joke:/);
  assert.ok(first.idea.length <= 280);
});

test("idea rolls require style, theme, message, and an image format", () => {
  assert.deepEqual(normalizeMemeIdea({
    style: "  strange   weather map  ",
    theme: "the weird hand forecasts a 100% chance of acceleration",
    message: "bring a brake",
    memeStyle: "NEWS"
  }), {
    style: "strange weather map",
    theme: "the weird hand forecasts a 100% chance of acceleration",
    message: "bring a brake",
    memeStyle: "news",
    idea: "A strange weather map where the weird hand forecasts a 100% chance of acceleration. The joke: “bring a brake”"
  });
  assert.throws(
    () => normalizeMemeIdea({ style: "poster", theme: "race", memeStyle: "poster" }),
    /incomplete roll/
  );
});

test("meme drafts survive a tab reload", () => {
  const saved = serializeMemeDraft({
    idea: "  A strange   STOPAI weather report  ",
    memeStyle: "NEWS"
  });
  assert.deepEqual(parseMemeDraft(saved), {
    idea: "A strange STOPAI weather report",
    memeStyle: "news"
  });
});

test("bad meme drafts are ignored", () => {
  assert.equal(parseMemeDraft(null), null);
  assert.equal(parseMemeDraft("not json"), null);
  assert.equal(parseMemeDraft(JSON.stringify({ idea: "ok", memeStyle: "news" })), null);
  assert.equal(parseMemeDraft({ idea: "A complete idea", memeStyle: "video" }), null);
  assert.throws(() => serializeMemeDraft({ idea: "", memeStyle: "poster" }), /incomplete/);
});
