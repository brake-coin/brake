import assert from "node:assert/strict";
import test from "node:test";

import { createBotConfig, usageLimits } from "../src/config.mjs";
import { buildChatMessages, buildImagePrompt, STOPAI_SYSTEM_PROMPT } from "../src/persona.mjs";
import {
  botTools,
  builtInReply,
  hasExplicitXPostIntent,
  hasMediaActionIntent,
  isAddressed
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
  assert.deepEqual([...createBotConfig({ TELEGRAM_OPERATOR_IDS: "12, nope,34" }).telegramOperatorIds], ["12", "34"]);
});

test("only operators receive destructive and public posting tools", () => {
  const publicNames = botTools().map((tool) => tool.function.name);
  const operatorNames = botTools({ isOperator: true }).map((tool) => tool.function.name);
  assert.deepEqual(publicNames, ["gallery_list", "gallery_show", "generate_image", "generate_video"]);
  assert.equal(operatorNames.includes("gallery_remove"), true);
  assert.equal(operatorNames.includes("post_to_x"), true);
  assert.equal(botTools()[2].function.parameters.properties.media_id.type, "string");
  assert.equal(botTools()[3].function.parameters.properties.media_id.type, "string");
  assert.equal(hasExplicitXPostIntent("post the latest image on X"), true);
  assert.equal(hasExplicitXPostIntent("show the latest image"), false);
  assert.equal(hasMediaActionIntent("animate this picture"), true);
  assert.equal(hasMediaActionIntent("a picture from the march"), false);
});

test("built-in facts remain available without an AI request", () => {
  const config = createBotConfig({
    OPENROUTER_CHAT_MODEL: "chat-model",
    OPENROUTER_SERVER_IMAGE_MODEL: "image-model",
    OPENROUTER_VIDEO_MODEL: "video-model"
  });
  assert.match(builtInReply({ text: "what is the CA?", config }), /2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS/);
  assert.match(builtInReply({ text: "which AI are you using?", config }), /Chat: chat-model/);
  assert.match(builtInReply({ text: "help", userId: "42", config }), /no slash commands/i);
  assert.match(builtInReply({ text: "am I an operator?", isOperator: true, config }), /configured STOPAI operator/);
  assert.equal(builtInReply({ text: "tell me a joke", config }), null);
});

test("persona publishes only the official mint and keeps the weird hand", () => {
  assert.match(STOPAI_SYSTEM_PROMPT, /2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS/);
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
