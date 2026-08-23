import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_X_POST_LENGTH,
  makeLaunchPost,
  makeTelegramLaunchPost
} from "../src/index.mjs";

const project = {
  name: "STOPAI",
  symbol: "STOPAI",
  tagline: "Stop the AI race.",
  contractAddress: "2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS",
  links: { bags: "https://bags.fm/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS" },
  independenceNotice: "Independent token.",
  riskNotice: "The token could lose all value."
};

test("X launch post fits the platform limit and publishes the verified mint", () => {
  const post = makeLaunchPost(project);
  assert.ok(post.length <= MAX_X_POST_LENGTH);
  assert.match(post, new RegExp(project.contractAddress));
  assert.match(post, /live on Solana/i);
});

test("Telegram launch post includes the mint, independence, and risk notices", () => {
  const post = makeTelegramLaunchPost(project);
  assert.match(post, new RegExp(project.contractAddress));
  assert.match(post, /Independent token/);
  assert.match(post, /could lose all value/);
});
