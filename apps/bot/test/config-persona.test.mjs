import assert from "node:assert/strict";
import test from "node:test";

import { createBotConfig, usageLimits } from "../src/config.mjs";
import {
  buildAgentDecisionMessages,
  buildChatMessages,
  buildImagePrompt,
  buildStickerPrompt,
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
  ensureStickerPackLink,
  isAddressed,
  isTelegramOperator,
  KeyedSerialQueue,
  mediaAltText,
  pickRandomMedia,
  sanitizeTelegramReply,
  TelegramService,
  telegramAddressedBy,
  telegramXPostMessage,
  telegramThreadId,
  telegramUpdateDecision,
  xPostIdsInText
} from "../src/telegram.mjs";

test("verified STOPAI X posts can be shared into the configured Telegram group", async () => {
  const config = createBotConfig({ X_EXPECTED_USERNAME: "STOPAICOIN" });
  const deliveries = [];
  const telegram = new TelegramService({
    config,
    store: {},
    openRouter: {},
    xClient: {},
    canonicalReferenceDataUrl: "data:image/png;base64,AA==",
    logger: { info() {} }
  });
  telegram.running = true;
  telegram.allowedChatId = "-100123";
  telegram.bot = {
    telegram: {
      sendMessage: async (...args) => {
        deliveries.push(args);
        return { message_id: 77, chat: { id: -100123 } };
      }
    }
  };

  const result = await telegram.shareXPost({
    text: "the accelerator has enough interns. send in the weird hand.",
    url: "https://x.com/STOPAICOIN/status/123456"
  });

  assert.deepEqual(result, { messageId: 77, chatId: -100123 });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0][0], "-100123");
  assert.match(deliveries[0][1], /New on X from @STOPAICOIN/);
  assert.match(deliveries[0][1], /the accelerator has enough interns/);
  assert.match(deliveries[0][1], /https:\/\/x\.com\/STOPAICOIN\/status\/123456/);
  assert.deepEqual(deliveries[0][2].link_preview_options, {
    is_disabled: false,
    url: "https://x.com/STOPAICOIN/status/123456"
  });
  assert.throws(() => telegramXPostMessage({
    text: "wrong account",
    url: "https://x.com/someone_else/status/123456",
    username: "STOPAICOIN"
  }), /Only a verified @STOPAICOIN/);
});

test("bot defaults use expanded shared usage limits", () => {
  const config = createBotConfig({});
  assert.deepEqual(usageLimits(config, "image"), {
    hourly: 20,
    daily: 100,
    userHourly: 10,
    userDaily: 30
  });
  assert.equal(config.videoDailyCap, 20);
  assert.equal(config.mediaDailySpendCapUsd, 50);
  assert.deepEqual(usageLimits(config, "chat"), {
    hourly: 300,
    daily: 2_000,
    userHourly: 100,
    userDaily: 500
  });
  assert.equal(config.requireTelegram, false);
  assert.equal(config.telegramGroupHandle, "StopAiCoin");
  assert.equal(config.telegramGroupUrl, "https://t.me/StopAiCoin");
  assert.equal(config.telegramCommunityUrl, "https://t.me/StopAiCoin");
  assert.equal(config.telegramAllowedChatId, "@StopAiCoin");
  assert.equal(config.telegramGalleryChatId, "@StopAiCoin");
  assert.equal(config.telegramStickerOwnerId, 0);
  assert.equal(createBotConfig({ TELEGRAM_STICKER_OWNER_ID: "12345" }).telegramStickerOwnerId, 12345);
  assert.equal(config.xPostingEnabled, false);
  assert.equal(config.xExpectedUsername, "STOPAICOIN");
  assert.equal(config.xAutonomousPostingEnabled, false);
  assert.equal(config.xAutonomousIntervalMinutes, 120);
  assert.equal(config.xAutonomousStartDelayMinutes, 15);
  assert.equal(config.xAutonomousHourlyCap, 30);
  assert.equal(config.xAutonomousDailyCap, 30);
  assert.equal(config.agentResearchEnabled, true);
  assert.equal(config.agentMaxSourceAgeHours, 168);
  assert.equal(config.agentXQueries.every((query) => query.includes("-is:reply")), true);
  assert.deepEqual(config.agentWatchAccounts, ["PauseAI"]);
  assert.equal(config.agentXQueries.some((query) => query.includes("AI crypto")), true);
  assert.deepEqual(config.xAutonomousTypes, ["text", "image"]);
  assert.deepEqual(usageLimits(config, "x_post"), {
    hourly: 20,
    daily: 80,
    userHourly: 10,
    userDaily: 30
  });
  assert.equal(config.xPostGlobalCooldownSeconds, 3_600);
  assert.equal(config.xPostUserCooldownSeconds, 14_400);
  assert.equal(config.openRouterChatModel, "~google/gemini-flash-latest");
  assert.equal(config.openRouterChatFallbackModel, "openrouter/auto");
  assert.equal(createBotConfig({ TELEGRAM_COMMUNITY_URL: "http://unsafe.example" }).telegramCommunityUrl,
    "https://t.me/StopAiCoin");
  assert.deepEqual(usageLimits(config, "x_research"), {
    hourly: 200,
    daily: 1_000,
    userHourly: 50,
    userDaily: 200
  });
  assert.deepEqual(usageLimits(config, "agent_x_research"), {
    hourly: 40,
    daily: 240,
    userHourly: 40,
    userDaily: 240
  });
  assert.deepEqual(
    createBotConfig({ X_AUTONOMOUS_TYPES: "video,text,unknown,video" }).xAutonomousTypes,
    ["video", "text"]
  );
  assert.deepEqual([...createBotConfig({ TELEGRAM_OPERATOR_IDS: "12, nope,34" }).telegramOperatorIds], ["12", "34"]);
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
    "generate_sticker",
    "send_sticker",
    "sticker_pack",
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
  assert.equal(
    botTools().find((tool) => tool.function.name === "generate_sticker")
      .function.parameters.properties.media_id.type,
    "string"
  );
  assert.equal(botTools({ imagesEnabled: false })
    .some((tool) => tool.function.name === "generate_sticker"), false);
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
  assert.equal(messages.at(-1).content, "Current member: post this on X");
  assert.doesNotMatch(messages.map((message) => message.content).join("\n"), /Telegram user ID: 42|Telegram user 42/);

  const decisionContext = buildAgentDecisionMessages({
    candidates: [],
    agent: {},
    allowedTypes: [],
    preferredType: "image",
    recentPerformance: [{
      url: "https://x.com/STOPAICOIN/status/123",
      mediaType: "image",
      metrics: { like_count: 7 }
    }],
    resources: { image: { availableNow: false, blockedReason: "daily_cap" } },
    now: new Date("2026-08-23T20:00:00.000Z")
  }).map((message) => message.content).join("\n");
  assert.match(decisionContext, /none; you must skip/i);
  assert.match(decisionContext, /low-cost organic campaign/i);
  assert.match(decisionContext, /three image posts followed by one text post/i);
  assert.match(decisionContext, /"organicCampaignTheme":\{"id":"/);
  assert.match(decisionContext, /"preferredMediaType":"image"/);
  assert.match(decisionContext, /"recentPerformance":\[\{"url":"https:\/\/x.com\/STOPAICOIN\/status\/123"/);
  assert.match(decisionContext, /"liveResources":\{"image":\{"availableNow":false/);
  assert.equal(ORGANIC_CAMPAIGN_THEMES.length, 8);
  assert.equal(typeof organicCampaignTheme(new Date("2026-08-23T20:00:00.000Z")).brief, "string");
});

test("group history keeps members distinct without exposing Telegram IDs", () => {
  const messages = buildChatMessages([
    { role: "user", userId: "700000001", content: "version 7 has 17 red items" },
    { role: "assistant", userId: "700000001", content: "Current member asked for version 7" },
    { role: "user", userId: "800000002", content: "show the gallery" }
  ], "what did I ask for?", {
    userId: "800000002",
    sharedHistory: [{
      role: "user",
      userId: "900000003",
      content: "the other topic discussed version 17"
    }]
  });
  const history = messages.slice(3, -1).map((message) => message.content);
  assert.deepEqual(history, [
    "[Other topic] Other member 2: the other topic discussed version 17",
    "Other member 1: version 7 has 17 red items",
    "STOPAI response to Other member 1: other member 1 asked for version 7",
    "Current member: show the gallery"
  ]);
  assert.equal(messages.at(-1).content, "Current member: what did I ask for?");
  const prompt = [...history, messages.at(-1).content].join("\n");
  assert.doesNotMatch(prompt, /700000001|800000002|900000003|Telegram user/);
  assert.match(prompt, /version 7 has 17 red items/);
  assert.match(messages[2].content, /Messages marked \[Other topic\]/);
});

test("Telegram replies hide internal IDs and always expose a new sticker pack", () => {
  const cleaned = sanitizeTelegramReply(
    "STOPAI reply to Telegram user 6569131978: version 16569131978 was added for 6569131978.",
    { currentUserId: "6569131978", knownUserIds: ["123456789"] }
  );
  assert.equal(cleaned, "version 16569131978 was added for you.");
  assert.equal(
    sanitizeTelegramReply("Current member asked Other member for it."),
    "you asked another member for it."
  );
  const url = "https://t.me/addstickers/stopai_stickers_by_stopaitoken_bot";
  assert.equal(ensureStickerPackLink("Sticker sent.", url), `Sticker sent.\n\nOpen the sticker pack: ${url}`);
  assert.equal(ensureStickerPackLink(`Open it: ${url}`, url), `Open it: ${url}`);
  assert.equal(ensureStickerPackLink("Sticker sent.", "https://example.com/bad"), "Sticker sent.");
});

test("conversation queues serialize one topic without blocking another", async () => {
  const queue = new KeyedSerialQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = queue.run("topic-a", async () => {
    events.push("first start");
    await firstGate;
    events.push("first end");
  });
  const second = queue.run("topic-a", async () => {
    events.push("second");
  });
  const other = queue.run("topic-b", async () => {
    events.push("other topic");
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["first start", "other topic"]);
  releaseFirst();
  await Promise.all([first, second, other]);
  assert.deepEqual(events, ["first start", "other topic", "first end", "second"]);
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
  assert.match(STOPAI_SYSTEM_PROMPT, /No such use is currently verified/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Every current X post you mention as an example must have its exact source link/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /counter-signal inside the AI-crypto trenches/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Accuracy always outranks the joke/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Never cosplay as a trader/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /does not make STOPAI affiliated with/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /private personal information/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /do not rely on model memory/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /1,000,000,000 STOPAI with 9 decimals/i);
  assert.match(buildImagePrompt("robot timeout"), /thumb attaches at an awkward angle/i);
  assert.match(buildImagePrompt("robot timeout"), /slightly unhinged meme energy/i);
  assert.match(buildStickerPrompt("robot timeout"), /pure solid black/i);
  assert.match(buildStickerPrompt("robot timeout"), /true transparency/i);
  const messages = buildChatMessages([], "what is the contract?");
  assert.equal(messages.at(-1).content, "Current member: what is the contract?");
});

test("group messages require an exact mention or direct reply", () => {
  const common = { botUsername: "stopai_bot", botId: 99 };
  assert.equal(isAddressed({ ...common, chatType: "private", message: { text: "hello" } }), false);
  assert.equal(isAddressed({ ...common, chatType: "group", message: { text: "hello" } }), false);
  assert.equal(isAddressed({ ...common, chatType: "group", message: { text: "@STOPAI_BOT hello" } }), true);
  assert.equal(isAddressed({
    ...common,
    chatType: "group",
    message: { text: "@stopai_bot_news hello" }
  }), false);
  assert.equal(isAddressed({
    ...common,
    chatType: "group",
    message: {
      text: "👋 @stopai_bot hello",
      entities: [{ type: "mention", offset: 3, length: 11 }]
    }
  }), true);
  assert.equal(isAddressed({
    ...common,
    chatType: "group",
    message: { text: "hello", reply_to_message: { from: { id: 99 } } }
  }), true);
  assert.equal(telegramAddressedBy({
    ...common,
    chatType: "supergroup",
    message: { text: "hello", reply_to_message: { from: { id: 99 } } }
  }), "reply");
});

test("Telegram policy allows only the configured group and logs clear outcomes", () => {
  const common = {
    chatType: "supergroup",
    chatId: -10042,
    allowedChatId: "-10042",
    botUsername: "stopai_bot",
    botId: 99,
    repliesEnabled: true
  };
  assert.deepEqual(telegramUpdateDecision({
    ...common,
    chatId: -10099,
    message: { text: "@stopai_bot hello", from: { id: 7 } }
  }), { action: "ignore", reason: "chat_not_allowed", claim: false });
  assert.deepEqual(telegramUpdateDecision({
    ...common,
    message: { text: "normal group chat", from: { id: 7 } }
  }), { action: "ignore", reason: "not_addressed", claim: false });
  assert.deepEqual(telegramUpdateDecision({
    ...common,
    message: { text: "@stopai_bot", from: { id: 7 } }
  }), { action: "ignore", reason: "empty_message", addressedBy: "mention", claim: false });
  assert.deepEqual(telegramUpdateDecision({
    ...common,
    message: { text: "@stopai_bot hello", from: { id: 7 } }
  }), {
    action: "group_text",
    reason: "agent_request",
    addressedBy: "mention",
    userText: "hello",
    claim: true
  });
  assert.deepEqual(telegramUpdateDecision({
    ...common,
    repliesEnabled: false,
    message: {
      caption: "@stopai_bot save this",
      photo: [{ file_id: "photo-1" }],
      from: { id: 7 }
    }
  }), {
    action: "ignore",
    reason: "replies_disabled",
    addressedBy: "mention",
    claim: false
  });
  const media = telegramUpdateDecision({
    ...common,
    message: {
      caption: "@stopai_bot remix this",
      photo: [{ file_id: "photo-1" }],
      from: { id: 7 }
    }
  });
  assert.equal(media.action, "group_media");
  assert.equal(media.reason, "media_agent_request");
  assert.equal(media.userText, "remix this");
  assert.equal(media.media.fileId, "photo-1");
  assert.deepEqual(telegramUpdateDecision({
    ...common,
    chatType: "private",
    chatId: 7,
    message: { text: "hello", from: { id: 7 } }
  }), { action: "dm_redirect", reason: "dm_redirect", claim: true });
  assert.equal(telegramThreadId({ message_thread_id: 123 }), "123");
  assert.equal(telegramThreadId({}), "main");
});

test("DM gallery selection returns one random group item", () => {
  const items = [{ id: "first" }, { id: "second" }, { id: "third" }];
  assert.equal(pickRandomMedia(items, () => 0), items[0]);
  assert.equal(pickRandomMedia(items, () => 0.5), items[1]);
  assert.equal(pickRandomMedia(items, () => 0.999), items[2]);
  assert.equal(pickRandomMedia([], () => 0), null);
});
