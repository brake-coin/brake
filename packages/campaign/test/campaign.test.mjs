import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_X_POST_LENGTH,
  makePrelaunchPost,
  makeTelegramPrelaunchPost
} from "../src/index.mjs";

const project = {
  name: "BRAKE",
  tagline: "Put the brakes on the AI race.",
  independenceNotice: "Independent pre-launch project.",
  riskNotice: "A future token could lose all value."
};

test("X pre-launch post fits the platform limit and warns about lookalikes", () => {
  const post = makePrelaunchPost(project);
  assert.ok(post.length <= MAX_X_POST_LENGTH);
  assert.match(post, /not live/i);
  assert.match(post, /No contract address/i);
});

test("Telegram pre-launch post includes independence and risk notices", () => {
  const post = makeTelegramPrelaunchPost(project);
  assert.match(post, /Independent pre-launch project/);
  assert.match(post, /could lose all value/);
});
