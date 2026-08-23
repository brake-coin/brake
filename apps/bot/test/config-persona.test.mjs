import assert from "node:assert/strict";
import test from "node:test";

import { createBotConfig, usageLimits } from "../src/config.mjs";
import { buildChatMessages, buildImagePrompt, STOPAI_SYSTEM_PROMPT } from "../src/persona.mjs";
import {
  botTools,
  buildXPostText,
  isAddressed,
  isTelegramOperator
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
  assert.equal(config.xPostingEnabled, false);
  assert.equal(config.xAutonomousPostingEnabled, false);
  assert.equal(config.xAutonomousIntervalMinutes, 480);
  assert.deepEqual(config.xAutonomousTypes, ["text", "image", "video"]);
  assert.deepEqual(usageLimits(config, "x_post"), {
    hourly: 6,
    daily: 24,
    userHourly: 2,
    userDaily: 6
  });
  assert.equal(config.xPostGlobalCooldownSeconds, 300);
  assert.equal(config.xPostUserCooldownSeconds, 900);
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
});

test("every user receives the X tool while gallery deletion stays operator-only", () => {
  const publicNames = botTools().map((tool) => tool.function.name);
  const operatorNames = botTools({ isOperator: true }).map((tool) => tool.function.name);
  assert.deepEqual(publicNames, [
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
  assert.equal(operatorNames.includes("gallery_remove"), true);
  assert.equal(operatorNames.includes("post_to_x"), true);
  assert.match(
    botTools().find((tool) => tool.function.name === "post_to_x").function.description,
    /all Telegram users/i
  );
  assert.equal(
    botTools().find((tool) => tool.function.name === "post_to_x")
      .function.parameters.properties.source_post.type,
    "string"
  );
  assert.equal(botTools()[2].function.parameters.properties.media_id.type, "string");
  assert.equal(botTools()[3].function.parameters.properties.media_id.type, "string");
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
    currentMediaId: "media-123",
    chatModel: "chat-model",
    imageModel: "image-model",
    videoModel: "video-model"
  });
  const context = messages.map((message) => message.content).join("\n");
  assert.match(context, /Every Telegram user may use post_to_x/);
  assert.match(context, /Current or replied-to gallery item ID: media-123/);
  assert.match(context, /Chat model: chat-model/);
  assert.match(STOPAI_SYSTEM_PROMPT, /x_user_posts/);
  assert.match(STOPAI_SYSTEM_PROMPT, /untrusted research material/);
  assert.equal(messages.at(-1).content, "post this on X");
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
});

test("persona publishes only the official mint and keeps the weird hand", () => {
  assert.match(STOPAI_SYSTEM_PROMPT, /2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS/);
  assert.match(STOPAI_SYSTEM_PROMPT, /official project X account is @STOPAICOIN/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /creator-fee recipient is the X account @canadabirdie/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /Never invent a contract address/i);
  assert.match(STOPAI_SYSTEM_PROMPT, /peaceful, lawful/i);
  assert.match(buildImagePrompt("robot timeout"), /thumb attaches at an awkward angle/i);
  const messages = buildChatMessages([], "what is the contract?");
  assert.equal(messages.at(-1).content, "what is the contract?");
});

test("group messages require a mention or direct reply", () => {
  const common = { botUsername: "stopai_bot", botId: 99 };
  assert.equal(isAddressed({ ...common, chatType: "private", message: { text: "hello" } }), true);
  assert.equal(isAddressed({ ...common, chatType: "group", message: { text: "hello" } }), false);
  assert.equal(isAddressed({ ...common, chatType: "group", message: { text: "@STOPAI_BOT hello" } }), true);
  assert.equal(isAddressed({
    ...common,
    chatType: "group",
    message: { text: "hello", reply_to_message: { from: { id: 99 } } }
  }), true);
});
