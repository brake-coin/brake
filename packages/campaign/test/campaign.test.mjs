import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_X_POST_LENGTH,
  makeFeeRoutePost,
  makeLaunchPost,
  makeListingCorrectionNote,
  makeListingDescription,
  makePinnedCampaignPost,
  makeTelegramLaunchPost
} from "../src/index.mjs";

const project = {
  name: "STOPAI",
  symbol: "STOPAI",
  tagline: "Stop the AI race.",
  description: "STOPAI is an independent Solana cultural memecoin and public-education project.",
  contractAddress: "2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS",
  links: {
    website: "https://stopai-coin.fly.dev",
    bags: "https://bags.fm/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS"
  },
  independenceNotice: "Independent token.",
  riskNotice: "The token could lose all value.",
  creatorFeeRecipient: {
    handle: "@canadabirdie",
    sharePercent: 100
  }
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

test("pinned counter-meta post fits and avoids financial instructions", () => {
  const post = makePinnedCampaignPost(project);
  assert.ok(post.length <= MAX_X_POST_LENGTH);
  assert.match(post, /pivot to stop ai crypto/i);
  assert.match(post, /not ur portfolio/i);
  assert.match(post, new RegExp(project.contractAddress));
  assert.doesNotMatch(post, /\b(buy|hold|pump)\b/i);
});

test("listing copy corrects the old X affiliation", () => {
  const description = makeListingDescription(project);
  const note = makeListingCorrectionNote(project);
  assert.match(description, /@STOPAICOIN/);
  assert.match(description, /not affiliated with @canadabirdie/i);
  assert.match(note, /outdated third-party metadata/i);
  assert.match(note, new RegExp(project.links.website));
});

test("fee-route post is exact, complete, and fits X", () => {
  const post = makeFeeRoutePost(project);
  assert.ok(post.length <= MAX_X_POST_LENGTH);
  assert.match(post, /100% of Bags creator fees/);
  assert.match(post, /@canadabirdie/);
  assert.match(post, /not affiliated with or endorsed by/i);
  assert.match(post, /holders have no claim/i);
  assert.match(post, new RegExp(project.contractAddress));
});
