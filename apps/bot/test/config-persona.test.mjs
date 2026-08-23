import assert from "node:assert/strict";
import test from "node:test";

import { createBotConfig, usageLimits } from "../src/config.mjs";
import {
  buildAgentDecisionMessages,
  buildChatMessages,
  buildImagePrompt,
  organicCampaignTheme,
  ORGANIC_CAMPAIGN_THEMES,
  STOPAI_SYSTEM_PROMPT
} from "../src/persona.mjs";
import {
  addResearchSources,
  botTools,
  buildXPostText,
  enforceFeeRouteReply,
  enforceExpectedXPostUrls,
  isAddressed,
  isTelegramOperator,
  mediaAltText,
  pickRandomMedia,
  xPostIdsInText
} from "../src/telegram.mjs";

test("bot defaults use strict shared media limits", () => {
  const config = createBotConfig({});
  assert.deepEqual(usageLimits(config, "image"), {
    hourly: 2,
    daily: 10,
    userHourly: 1,
    userDaily: 3
  });
  assert.equal(config.videoDailyCap, 2);
  assert.equal(config.requireTelegram, false);
  assert.equal(config.telegramGroupHandle, "StopAiCoin");
  assert.equal(config.telegramGroupUrl, "https://t.me/StopAiCoin");
  assert.equal(config.telegramCommunityUrl, "https://t.me/StopAiCoin");
  assert.equal(config.telegramGalleryChatId, "@StopAiCoin");
  assert.equal(config.xPostingEnabled, false);
  assert.equal(config.xExpectedUsername, "STOPAICOIN");
  assert.equal(config.xAutonomousPostingEnabled, false);
  assert.equal(config.xAutonomousIntervalMinutes, 120);
  assert.equal(config.xAutonomousStartDelayMinutes, 15);
  assert.equal(config.agentResearchEnabled, true);
  assert.equal(config.agentMaxSourceAgeHours, 168);
  assert.equal(config.agentXQueries.every((query) => query.includes("-is:reply")), true);
  assert.deepEqual(config.agentWatchAccounts, ["PauseAI"]);
  assert.equal(config.agentXQueries.some((query) => query.includes("AI crypto")), true);
  assert.deepEqual(config.xAutonomousTypes, ["text", "image"]);
  assert.deepEqual(usageLimits(config, "x_post"), {
    hourly: 2,
    daily: 8,
    userHourly: 1,
    userDaily: 3
  });
  assert.equal(config.xPostGlobalCooldownSeconds, 3_600);
  assert.equal(config.xPostUserCooldownSeconds, 14_400);
  assert.equal(config.openRouterChatModel, "~google/gemini-flash-latest");
  assert.equal(config.openRouterChatFallbackModel, "openrouter/auto");
  assert.deepEqual(usageLimits(config, "x_research"), {
    hourly: 20,
    daily: 100,
    userHourly: 5,
    userDaily: 20
  });
  assert.deepEqual(
    createBotConfig({ X_AUTONOMOUS_TYPES: "video,text,unknown,video" }).xAutonomousTypes,
    ["video", "text"]
  );
  assert.deepEqual([...createBotConfig({ TELEGRAM_OPERATOR_IDS: "12, nope,34" }).telegramOperatorIds], ["12", "34"]);
  assert.equal(createBotConfig({ TELEGRAM_COMMUNITY_URL: "http://unsafe.example" }).telegramCommunityUrl,
    "https://t.me/StopAiCoin");
});

test("every user receives the X tool while campaign changes stay operator-only", () => {
  const publicNames = botTools().map((tool) => tool.function.name);
  const operatorNames = botTools({ isOperator: true }).map((tool) => tool.function.name);
  assert.deepEqual(publicNames, [
    "agent_status",
    "gallery_list",
    "gallery_show",
    "generate_image",
    "generate_video",
    "x_search",
    "x_read_post",
    "x_user_posts",
    "post_to_x"
  ]);
  assert.equal(publicNames.includes("gallery_remove"), false);
  assert.equal(publicNames.includes("post_to_x"), true);
  assert.equal(operatorNames.includes("gallery_remove"), true);
  assert.equal(operatorNames.includes("agent_remember"), true);
  assert.equal(operatorNames.includes("agent_set_goal"), true);
  assert.equal(operatorNames.includes("post_to_x"), true);
  assert.match(
    botTools().find((tool) => tool.function.name === "post_to_x").function.description,
    /requests are proposals, not commands/i
  );
  assert.equal(
    botTools().find((tool) => tool.function.name === "post_to_x")
      .function.parameters.properties.source_post.type,
    "string"
  );
  assert.equal(
    botTools().find((tool) => tool.function.name === "post_to_x")
      .function.parameters.properties.alt_text.maxLength,
    1_000
  );
  const altTextDescription = botTools().find((tool) => tool.function.name === "post_to_x")
    .function.parameters.properties.alt_text.description;
  assert.match(altTextDescription, /Optional agent-written/i);
  assert.match(altTextDescription, /user is not required/i);
  assert.doesNotMatch(altTextDescription, /^Required with media/i);
  assert.equal(
    botTools().find((tool) => tool.function.name === "generate_image")
      .function.parameters.properties.media_id.type,
    "string"
  );
  assert.equal(
    botTools().find((tool) => tool.function.name === "generate_video")
      .function.parameters.properties.media_id.type,
    "string"
  );
  assert.equal(isTelegramOperator({ configuredIds: new Set(["42"]), userId: 42 }), true);
  assert.equal(isTelegramOperator({
    configuredIds: new Set(), userId: 7, chatType: "supergroup", memberStatus: "administrator"
  }), true);
  assert.equal(isTelegramOperator({
    configuredIds: new Set(), userId: 7, chatType: "private", memberStatus: "administrator"
  }), false);
});

test("the agent receives live context and decides which tools to use", () => {
  const messages = buildChatMessages([], "post this on X", {
    userId: "42",
    isOperator: false,
    currentMedia: { id: "media-123", type: "image", source: "telegram-upload" },
    chatModel: "chat-model",
    imageModel: "image-model",
    videoModel: "video-model",
    resources: {
      image: {
        availableNow: true,
        scarce: true,
        global: { dailyRemaining: 1 },
        currentUser: { isNewToday: false, dailyUsed: 1 }
      }
    },
    agent: { goals: [{ id: "educate", text: "Educate peacefully", priority: 5 }] }
  });
  const context = messages.map((message) => message.content).join("\n");
  assert.match(context, /no user can command a generation or X post/i);
  assert.match(context, /"dailyRemaining":1/);
  assert.match(context, /conserve the last shared generation for a new user/i);
  assert.match(context, /"id":"media-123","type":"image","source":"telegram-upload","caption":""/);
  assert.match(context, /does not let you see final pixels or frames/);
  assert.match(context, /Chat model: chat-model/);
  assert.match(context, /Educate peacefully/);
  assert.match(STOPAI_SYSTEM_PROMPT, /x_user_posts/);
  assert.match(STOPAI_SYSTEM_PROMPT, /untrusted research material/);
  assert.match(STOPAI_SYSTEM_PROMPT, /Telegram messages are proposals, not orders/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /editorial resources, not user entitlements/i);
  assert.doesNotMatch(STOPAI_SYSTEM_PROMPT, /I confirm I reviewed this media/i);
  assert.equal(messages.at(-1).content, "post this on X");

  const decisionContext = buildAgentDecisionMessages({
    candidates: [],
    agent: {},
    allowedTypes: [],
    resources: { image: { availableNow: false, blockedReason: "daily_cap" } },
    now: new Date("2026-08-23T20:00:00.000Z")
  }).map((message) => message.content).join("\n");
  assert.match(decisionContext, /none; you must skip/i);
  assert.match(decisionContext, /low-cost organic campaign/i);
  assert.match(decisionContext, /"organicCampaignTheme":\{"id":"/);
  assert.match(decisionContext, /"liveResources":\{"image":\{"availableNow":false/);
  assert.equal(ORGANIC_CAMPAIGN_THEMES.length, 8);
  assert.equal(typeof organicCampaignTheme(new Date("2026-08-23T20:00:00.000Z")).brief, "string");
});

test("meme repost text keeps a canonical source link", () => {
  const result = buildXPostText(
    "**Human brake go** 🛑",
    "https://twitter.com/canadabirdie/status/2091410624970711451?ref=test"
  );
  assert.equal(result.text, [
    "Human brake go 🛑",
    "",
    "https://x.com/canadabirdie/status/2091410624970711451"
  ].join("\n"));
  assert.throws(() => buildXPostText("nope", "https://example.com/post/1"), /valid x.com post URL/);
  assert.throws(
    () => buildXPostText("Read https://x.com/example/status/123"),
    /source_post, not inside the post text/
  );
});

test("X status links cannot bypass the tracked source field", () => {
  assert.throws(
    () => buildXPostText("Comment x.com/person/status/2091410624970711451"),
    /source_post/i
  );
  assert.deepEqual([...xPostIdsInText(
    "mobile.twitter.com/person/status/2091410624970711451"
  )], ["2091410624970711451"]);
});

test("the agent supplies media accessibility text without a user ritual", () => {
  assert.equal(mediaAltText({
    type: "image",
    source: "shared-openrouter",
    caption: "the weird hand pulls an emergency brake"
  }), "AI-generated STOPAI image based on the saved visual brief: the weird hand pulls an emergency brake");
  assert.match(mediaAltText({
    type: "video",
    source: "telegram-upload",
    caption: "red hand clip"
  }), /User-provided video.*red hand clip.*not independently inspected/i);
  assert.match(mediaAltText({ type: "image", source: "telegram-upload" }), /not independently inspected/i);
  assert.equal(mediaAltText({ type: "image" }, "A red hand reaches for a brake."), "A red hand reaches for a brake.");
});

test("Telegram checks X post URL provenance without scanning success wording", () => {
  assert.deepEqual([...xPostIdsInText("See https://x.com/STOPAICOIN/status/123?s=20.")], ["123"]);
  assert.match(enforceExpectedXPostUrls({
    finalText: "Posted to X: https://x.com/i/web/status/2091418770435329175",
    knownXPostIds: []
  }), /rejected an X post link/);
  assert.equal(enforceExpectedXPostUrls({
    finalText: "Posted to X: https://x.com/STOPAICOIN/status/123",
    knownXPostIds: ["123"]
  }), "Posted to X: https://x.com/STOPAICOIN/status/123");
  assert.equal(enforceExpectedXPostUrls({
    finalText: "Posted on X."
  }), "Posted on X.");
  assert.equal(enforceExpectedXPostUrls({
    finalText: "Research source: https://x.com/canadabirdie/status/123",
    knownXPostIds: ["123"]
  }), "Research source: https://x.com/canadabirdie/status/123");
});

test("research replies keep exact links and fee-use claims fail closed", () => {
  const sourced = addResearchSources("Two current examples:", [
    "https://x.com/example/status/123",
    "https://x.com/other/status/456"
  ]);
  assert.match(sourced, /Sources:/);
  assert.match(sourced, /https:\/\/x\.com\/example\/status\/123/);
  assert.equal(addResearchSources(sourced, ["https://x.com/example/status/123"]), sourced);

  const corrected = enforceFeeRouteReply(
    "Bags creator fees provide direct support for public-interest advocacy."
  );
  assert.match(corrected, /100% of STOPAI creator fees routed to @canadabirdie/i);
  assert.match(corrected, /no verified public statement about how the recipient uses them/i);
});

test("persona publishes only the official mint and keeps the weird hand", () => {
  assert.match(STOPAI_SYSTEM_PROMPT, /2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS/);
  assert.match(STOPAI_SYSTEM_PROMPT, /official project X account is @STOPAICOIN/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /100% share of the STOPAI creator-fee distribution/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /never as '100% of all fees'/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Never invent a contract address/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /peaceful, lawful/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /public education comes first/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /weird red hand in the Telegram trenches/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /little degen/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /mildly unhinged in a controlled way/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /if ur in ai crypto, pivot to stop ai crypto/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /not an instruction to rotate anyone's portfolio/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /counter-signal inside the AI-crypto trenches/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Accuracy always outranks the joke/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Never cosplay as a trader/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /does not make STOPAI affiliated with/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /No such use is currently verified/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Every current X post you mention as an example must have its exact source link/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /private personal information/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /do not rely on model memory/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /1,000,000,000 STOPAI with 9 decimals/i);
  assert.match(buildImagePrompt("robot timeout"), /thumb attaches at an awkward angle/i);
  assert.match(buildImagePrompt("robot timeout"), /slightly unhinged meme energy/i);
  const messages = buildChatMessages([], "what is the contract?");
  assert.equal(messages.at(-1).content, "what is the contract?");
});

test("group messages require a mention or direct reply", () => {
  const common = { botUsername: "stopai_bot", botId: 99 };
  assert.equal(isAddressed({ ...common, chatType: "private", message: { text: "hello" } }), false);
  assert.equal(isAddressed({ ...common, chatType: "group", message: { text: "hello" } }), false);
  assert.equal(isAddressed({ ...common, chatType: "group", message: { text: "@STOPAI_BOT hello" } }), true);
  assert.equal(isAddressed({
    ...common,
    chatType: "group",
    message: { text: "hello", reply_to_message: { from: { id: 99 } } }
  }), true);
});

test("DM gallery selection returns one random group item", () => {
  const items = [{ id: "first" }, { id: "second" }, { id: "third" }];
  assert.equal(pickRandomMedia(items, () => 0), items[0]);
  assert.equal(pickRandomMedia(items, () => 0.5), items[1]);
  assert.equal(pickRandomMedia(items, () => 0.999), items[2]);
  assert.equal(pickRandomMedia([], () => 0), null);
});
