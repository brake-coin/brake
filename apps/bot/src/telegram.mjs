import { Telegraf } from "telegraf";

import { usageLimits } from "./config.mjs";
import {
  buildChatMessages,
  buildImagePrompt,
  buildVideoPrompt,
  removeBotMention
} from "./persona.mjs";
import { imageBufferToDataUrl, OpenRouterError } from "./openrouter.mjs";
import { XError } from "./x.mjs";

const BASE_TOOLS = [
  {
    type: "function",
    function: {
      name: "gallery_list",
      description: "List recent images and videos saved in this Telegram chat.",
      parameters: {
        type: "object",
        properties: {
          media_type: { type: "string", enum: ["image", "video"], description: "Optional filter." },
          limit: { type: "integer", minimum: 1, maximum: 10 }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "gallery_show",
      description: "Send a saved image or video back into this Telegram chat.",
      parameters: {
        type: "object",
        properties: {
          media_id: { type: "string", description: "A gallery ID, caption search, or latest." }
        },
        required: ["media_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Create and send a new STOPAI image, then save it to the chat gallery.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string", minLength: 1, maxLength: 1200 } },
        required: ["prompt"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_video",
      description: "Create and send a short STOPAI video, then save it to the chat gallery.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string", minLength: 1, maxLength: 1000 } },
        required: ["prompt"],
        additionalProperties: false
      }
    }
  }
];

const OPERATOR_TOOLS = [
  {
    type: "function",
    function: {
      name: "gallery_remove",
      description: "Remove an item from this chat's bot gallery. Operator only. This does not delete Telegram messages.",
      parameters: {
        type: "object",
        properties: { media_id: { type: "string", description: "A gallery ID, caption search, or latest." } },
        required: ["media_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "post_to_x",
      description: "Prepare a public X post for operator confirmation. It never posts immediately.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 1, maxLength: 280 },
          media_id: { type: "string", description: "Optional gallery ID, caption search, or latest." }
        },
        required: ["text"],
        additionalProperties: false
      }
    }
  }
];

export function botTools({ isOperator = false, imagesEnabled = true, videosEnabled = true } = {}) {
  const namesToSkip = new Set([
    ...(!imagesEnabled ? ["generate_image"] : []),
    ...(!videosEnabled ? ["generate_video"] : [])
  ]);
  return [
    ...BASE_TOOLS.filter((tool) => !namesToSkip.has(tool.function.name)),
    ...(isOperator ? OPERATOR_TOOLS : [])
  ];
}

function mediaFromMessage(message) {
  if (message?.photo?.length) {
    return { type: "image", fileId: message.photo.at(-1).file_id };
  }
  if (message?.video?.file_id) return { type: "video", fileId: message.video.file_id };
  const mimeType = message?.document?.mime_type || "";
  if (message?.document?.file_id && mimeType.startsWith("image/")) {
    return { type: "image", fileId: message.document.file_id };
  }
  if (message?.document?.file_id && mimeType.startsWith("video/")) {
    return { type: "video", fileId: message.document.file_id };
  }
  return null;
}

export function isAddressed({ message, chatType, botUsername, botId }) {
  if (chatType === "private") return true;
  const text = String(message?.text || message?.caption || "");
  if (botUsername && text.toLowerCase().includes(`@${botUsername}`.toLowerCase())) return true;
  return Boolean(botId && message?.reply_to_message?.from?.id === botId);
}

export function hasExplicitXPostIntent(text) {
  const value = String(text || "");
  return /\b(post|publish|tweet|send|share)\b[\s\S]{0,80}\b(x|twitter)\b/i.test(value)
    || /\b(x|twitter)\b[\s\S]{0,80}\b(post|publish|tweet|send|share)\b/i.test(value);
}

function hasExplicitDeleteIntent(text) {
  return /\b(delete|remove|forget)\b/i.test(String(text || ""));
}

function isPostConfirmation(text) {
  return /^(?:yes[,]?\s+)?confirm(?:\s+(?:the|x))?\s+post[.!]?$/i.test(String(text || "").trim());
}

function isPostCancellation(text) {
  return /^(?:cancel|discard)(?:\s+(?:the|x))?\s+post[.!]?$/i.test(String(text || "").trim());
}

function limitMessage(type, claim) {
  if (claim.reason === "daily_spend_cap") {
    return "The shared media budget is done for today. BYOK generation on the website still works.";
  }
  return `The shared ${type} limit is reached. Try again after the hourly or daily reset.`;
}

function safeErrorMessage(error) {
  if (error instanceof OpenRouterError || error instanceof XError) return error.message;
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return "The service took too long. Try again.";
  }
  return "STOPAI hit a snag. Try again in a moment.";
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })
  ]).finally(() => clearTimeout(timer));
}

function parseArguments(toolCall) {
  try {
    const value = JSON.parse(toolCall?.function?.arguments || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error("The AI supplied invalid tool details.");
  }
}

function shortMedia(media) {
  return {
    id: media.id.slice(0, 8),
    type: media.type,
    caption: media.caption || "untitled",
    source: media.source,
    saved_at: media.at
  };
}

export class TelegramService {
  constructor({
    config,
    store,
    openRouter,
    xClient,
    canonicalReferenceDataUrl,
    fetchImpl = fetch,
    logger = console
  }) {
    this.config = config;
    this.store = store;
    this.openRouter = openRouter;
    this.xClient = xClient;
    this.canonicalReferenceDataUrl = canonicalReferenceDataUrl;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.bot = null;
    this.botInfo = null;
    this.launchPromise = null;
    this.lastError = null;
    this.running = false;
  }

  status() {
    return {
      configured: Boolean(this.config.telegramToken),
      running: this.running,
      username: this.botInfo?.username || null,
      error: this.lastError
    };
  }

  async start() {
    if (this.running) return true;
    await this.store.load();
    if (!this.config.telegramToken) {
      this.logger.warn("[telegram] TELEGRAM_BOT_TOKEN is missing; bot is not started");
      return false;
    }
    this.bot = new Telegraf(this.config.telegramToken, {
      handlerTimeout: this.config.telegramHandlerTimeoutMs
    });
    this.lastError = null;
    this.#registerHandlers();
    this.bot.catch((error) => {
      this.lastError = safeErrorMessage(error);
      this.logger.error("[telegram] handler failed", error);
    });
    this.botInfo = await withTimeout(
      this.bot.telegram.getMe(),
      15_000,
      "Telegram token check timed out."
    );
    await this.bot.telegram.deleteMyCommands()
      .catch((error) => this.logger.warn("[telegram] command menu removal failed", error.message));
    this.launchPromise = this.bot.launch({ dropPendingUpdates: false });
    this.running = true;
    this.launchPromise.catch((error) => {
      this.running = false;
      this.lastError = "Telegram polling stopped.";
      this.logger.error("[telegram] polling stopped", error);
    });
    this.logger.info(`[telegram] @${this.botInfo.username} is listening`);
    return true;
  }

  async stop(reason = "shutdown") {
    if (!this.bot) return;
    this.running = false;
    try {
      this.bot.stop(reason);
    } catch (error) {
      this.logger.warn("[telegram] stop skipped", error.message);
    }
    await this.launchPromise?.catch(() => {});
  }

  async configureToken(token) {
    await this.stop("reconfigure");
    this.bot = null;
    this.botInfo = null;
    this.launchPromise = null;
    this.lastError = null;
    this.config.telegramToken = token || "";
    if (!this.config.telegramToken) return false;
    return this.start();
  }

  #registerHandlers() {
    this.bot.on(["photo", "video", "document"], (ctx) => this.#handleIncomingMedia(ctx));
    this.bot.on("text", (ctx) => this.#handleText(ctx));
  }

  #isOperator(userId) {
    return this.config.telegramOperatorIds?.has(String(userId || "")) || false;
  }

  async #handleText(ctx) {
    const message = ctx.message;
    if (!message?.text || message.from?.is_bot) return;
    if (!this.config.telegramRepliesEnabled) return;
    if (!isAddressed({
      message,
      chatType: ctx.chat?.type,
      botUsername: this.botInfo?.username,
      botId: this.botInfo?.id
    })) return;

    const userText = removeBotMention(message.text, this.botInfo?.username);
    if (!userText) return;
    const isOperator = this.#isOperator(ctx.from?.id);

    if (userText.startsWith("/")) {
      await ctx.reply([
        "No slash commands here — just ask in normal words.",
        "I can manage this chat's gallery, make images and videos, and prepare X posts for an operator.",
        `Your Telegram user ID is ${ctx.from?.id || "unknown"}.`
      ].join("\n"));
      return;
    }
    if (/\b(?:my|the)\s+telegram\s+(?:user\s+)?id\b/i.test(userText)) {
      await ctx.reply(`Your Telegram user ID is ${ctx.from?.id || "unknown"}.`);
      return;
    }
    if (isPostConfirmation(userText)) {
      await this.#confirmXPost(ctx, isOperator);
      return;
    }
    if (isPostCancellation(userText)) {
      const action = this.store.pendingAction({ type: "x_post", chatId: ctx.chat.id, userId: ctx.from?.id });
      if (action) await this.store.completePendingAction(action.id);
      await ctx.reply(action ? "X draft discarded." : "There is no pending X draft.");
      return;
    }
    if (!await this.openRouter.connected()) {
      await ctx.reply("The shared OpenRouter account is not connected yet.");
      return;
    }

    const claim = await this.store.claimUsage(
      "chat",
      ctx.from?.id,
      usageLimits(this.config, "chat")
    );
    if (!claim.allowed) {
      await ctx.reply(limitMessage("chat", claim));
      return;
    }

    const history = this.store.recentMessages(ctx.chat.id);
    await this.store.recordMessage({ chatId: ctx.chat.id, role: "user", content: userText });
    await ctx.sendChatAction("typing").catch(() => {});
    const messages = buildChatMessages(history, userText, {
      userId: ctx.from?.id,
      isOperator
    });
    const tools = botTools({
      isOperator,
      imagesEnabled: this.config.telegramImagesEnabled,
      videosEnabled: this.config.telegramVideosEnabled
    });
    let totalCostUsd = 0;
    let finalText = "";
    try {
      for (let round = 0; round < 4; round += 1) {
        const result = await this.openRouter.chatStep(messages, tools);
        totalCostUsd += result.costUsd;
        messages.push(result.message);
        const toolCalls = result.message.tool_calls || [];
        if (!toolCalls.length) {
          finalText = result.message.content || "Done.";
          break;
        }
        for (const toolCall of toolCalls) {
          const toolResult = await this.#executeTool(ctx, toolCall, { userText, isOperator });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function?.name,
            content: JSON.stringify(toolResult)
          });
        }
      }
      if (!finalText) finalText = "I finished the tool work.";
      await this.store.recordCost(claim.eventId, totalCostUsd);
      await this.store.recordMessage({ chatId: ctx.chat.id, role: "assistant", content: finalText });
      await ctx.reply(finalText.slice(0, 3_900));
    } catch (error) {
      await this.store.recordCost(claim.eventId, totalCostUsd);
      this.logger.error("[telegram] agent failed", error);
      await ctx.reply(safeErrorMessage(error));
    }
  }

  async #executeTool(ctx, toolCall, { userText, isOperator }) {
    const name = toolCall?.function?.name;
    try {
      const args = parseArguments(toolCall);
      if (name === "gallery_list") {
        const type = ["image", "video"].includes(args.media_type) ? args.media_type : null;
        const items = this.store.listMedia(ctx.chat.id, { type, limit: args.limit });
        return { ok: true, items: items.map(shortMedia) };
      }
      if (name === "gallery_show") {
        const media = this.store.findMedia(ctx.chat.id, args.media_id);
        if (!media) return { ok: false, error: "No matching gallery item was found." };
        await this.#sendMedia(ctx, media);
        return { ok: true, item: shortMedia(media), sent: true };
      }
      if (name === "gallery_remove") {
        if (!isOperator) return { ok: false, error: "Only an operator can remove gallery items." };
        if (!hasExplicitDeleteIntent(userText)) {
          return { ok: false, error: "The operator did not explicitly ask to delete or remove anything." };
        }
        const media = this.store.findMedia(ctx.chat.id, args.media_id);
        if (!media) return { ok: false, error: "No matching gallery item was found." };
        await this.store.removeMedia({ chatId: ctx.chat.id, mediaId: media.id });
        return { ok: true, removed: shortMedia(media), telegram_message_deleted: false };
      }
      if (name === "generate_image") return this.#generateImage(ctx, args.prompt);
      if (name === "generate_video") return this.#generateVideo(ctx, args.prompt);
      if (name === "post_to_x") {
        return this.#prepareXPost(ctx, args, { userText, isOperator });
      }
      return { ok: false, error: "Unknown tool." };
    } catch (error) {
      this.logger.error(`[telegram] ${name || "tool"} failed`, error);
      return { ok: false, error: safeErrorMessage(error) };
    }
  }

  async #generateImage(ctx, promptValue) {
    const prompt = String(promptValue || "").trim().slice(0, 1_200);
    if (!prompt) return { ok: false, error: "An image idea is required." };
    if (!this.config.telegramImagesEnabled) {
      return { ok: false, error: "Shared image generation is turned off. Website BYOK still works." };
    }
    const claim = await this.store.claimUsage(
      "image",
      ctx.from?.id,
      usageLimits(this.config, "image"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) return { ok: false, error: limitMessage("image", claim) };

    await ctx.reply("Putting the weird hand to work…");
    await ctx.sendChatAction("upload_photo").catch(() => {});
    const repliedReference = await this.#referenceFromReply(ctx);
    const references = [this.canonicalReferenceDataUrl, repliedReference].filter(Boolean);
    const result = await this.openRouter.generateImage({
      prompt: buildImagePrompt(prompt),
      referenceDataUrls: references
    });
    await this.store.recordCost(claim.eventId, result.costUsd);
    const sent = await ctx.replyWithPhoto(result.buffer ? { source: result.buffer } : result.url, {
      caption: `STOPAI ✋🏻😡\n${prompt.slice(0, 700)}`
    });
    const fileId = sent.photo?.at(-1)?.file_id;
    if (!fileId) return { ok: true, sent: true, saved: false };
    const media = await this.store.recordMedia({
      chatId: ctx.chat.id,
      userId: ctx.from?.id,
      type: "image",
      fileId,
      caption: prompt,
      source: "shared-openrouter"
    });
    return { ok: true, sent: true, saved: true, item: shortMedia(media) };
  }

  async #generateVideo(ctx, promptValue) {
    const prompt = String(promptValue || "").trim().slice(0, 1_000);
    if (!prompt) return { ok: false, error: "A video idea is required." };
    if (!this.config.telegramVideosEnabled) {
      return { ok: false, error: "Shared video generation is turned off." };
    }
    const claim = await this.store.claimUsage(
      "video",
      ctx.from?.id,
      usageLimits(this.config, "video"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) return { ok: false, error: limitMessage("video", claim) };

    await ctx.reply("Starting a short STOPAI clip. This can take several minutes…");
    await ctx.sendChatAction("upload_video").catch(() => {});
    const referenceDataUrl = await this.#referenceFromReply(ctx) || this.canonicalReferenceDataUrl;
    const result = await this.openRouter.generateVideo({
      prompt: buildVideoPrompt(prompt),
      referenceDataUrl
    });
    await this.store.recordCost(claim.eventId, result.costUsd);
    const sent = await ctx.replyWithVideo({ source: result.buffer }, {
      caption: `STOPAI ✋🏻😡\n${prompt.slice(0, 700)}`,
      supports_streaming: true
    });
    const fileId = sent.video?.file_id;
    if (!fileId) return { ok: true, sent: true, saved: false };
    const media = await this.store.recordMedia({
      chatId: ctx.chat.id,
      userId: ctx.from?.id,
      type: "video",
      fileId,
      caption: prompt,
      source: "shared-openrouter"
    });
    return { ok: true, sent: true, saved: true, item: shortMedia(media) };
  }

  async #prepareXPost(ctx, args, { userText, isOperator }) {
    if (!isOperator) return { ok: false, error: "Only an operator can prepare X posts." };
    if (!hasExplicitXPostIntent(userText)) {
      return { ok: false, error: "Ask explicitly to post or publish on X first." };
    }
    if (!this.xClient || !await this.xClient.connected()) {
      return { ok: false, error: "X posting is not connected or enabled." };
    }
    const text = String(args.text || "").trim();
    if (!text) return { ok: false, error: "The X draft needs text." };
    if (text.length > this.config.xMaxPostCharacters) {
      return { ok: false, error: `The X draft is over ${this.config.xMaxPostCharacters} characters.` };
    }
    let media = null;
    if (args.media_id) {
      media = this.store.findMedia(ctx.chat.id, args.media_id);
      if (!media) return { ok: false, error: "No matching gallery item was found." };
    }
    await this.store.stagePendingAction({
      type: "x_post",
      chatId: ctx.chat.id,
      userId: ctx.from?.id,
      payload: { text, mediaId: media?.id || null }
    });
    await ctx.reply([
      "X draft — not posted yet:",
      text,
      media ? `Media: ${media.type} ${media.id.slice(0, 8)} (${media.caption || "untitled"})` : "Media: none",
      "Reply exactly “confirm post” to publish, or “cancel post” to discard."
    ].join("\n"));
    return {
      ok: true,
      posted: false,
      confirmation_required: true,
      draft: { text, media: media ? shortMedia(media) : null },
      instruction: "The exact draft and confirmation instruction were already shown to the operator. Do not claim it was posted."
    };
  }

  async #confirmXPost(ctx, isOperator) {
    if (!isOperator) {
      await ctx.reply("Only a configured operator can publish to X.");
      return;
    }
    if (!this.xClient || !await this.xClient.connected()) {
      await ctx.reply("X posting is not connected or enabled.");
      return;
    }
    const action = await this.store.takePendingAction({
      type: "x_post",
      chatId: ctx.chat.id,
      userId: ctx.from?.id
    });
    if (!action) {
      await ctx.reply("There is no pending X draft. Ask me to prepare one first.");
      return;
    }
    try {
      let media = null;
      if (action.payload.mediaId) {
        const record = this.store.findMedia(ctx.chat.id, action.payload.mediaId);
        if (!record) throw new XError("The draft's gallery item no longer exists.", 400);
        media = await this.#downloadMedia(ctx, record);
      }
      await ctx.reply("Posting the approved draft to X…");
      const result = await this.xClient.post({ text: action.payload.text, media });
      await ctx.reply(`Posted to X: ${result.url}`);
    } catch (error) {
      this.logger.error("[telegram] X post failed", error);
      await ctx.reply(`${safeErrorMessage(error)} The draft was discarded to prevent a duplicate post.`);
    }
  }

  async #handleIncomingMedia(ctx) {
    const media = mediaFromMessage(ctx.message);
    if (!media || ctx.message?.from?.is_bot) return;
    if (!isAddressed({
      message: ctx.message,
      chatType: ctx.chat?.type,
      botUsername: this.botInfo?.username,
      botId: this.botInfo?.id
    })) return;
    const record = await this.store.recordMedia({
      chatId: ctx.chat.id,
      userId: ctx.from?.id,
      type: media.type,
      fileId: media.fileId,
      caption: removeBotMention(ctx.message.caption || "", this.botInfo?.username),
      source: "telegram-upload"
    });
    await ctx.reply([
      `Saved that ${media.type} in this chat's gallery as ${record.id.slice(0, 8)}.`,
      "Ask me naturally to show it, remix it, animate it, or prepare it for X."
    ].join("\n"));
  }

  async #sendMedia(ctx, media) {
    const options = media.caption ? { caption: media.caption.slice(0, 900) } : {};
    if (media.type === "video") await ctx.replyWithVideo(media.fileId, options);
    else await ctx.replyWithPhoto(media.fileId, options);
  }

  async #downloadMedia(ctx, media) {
    const fileUrl = await ctx.telegram.getFileLink(media.fileId);
    let response;
    try {
      response = await this.fetchImpl(fileUrl, {
        signal: AbortSignal.timeout(60_000),
        redirect: "follow"
      });
    } catch {
      throw new XError("Telegram could not load the selected media.");
    }
    if (!response.ok) throw new XError("Telegram could not load the selected media.");
    const maxBytes = media.type === "video" ? this.config.maxVideoBytes : this.config.maxImageBytes;
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > maxBytes) throw new XError("The selected media is too large.", 400);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new XError("The selected media is too large.", 400);
    const fallback = media.type === "video" ? "video/mp4" : "image/jpeg";
    const mimeType = response.headers.get("content-type") || fallback;
    return { buffer, mimeType, type: media.type };
  }

  async #referenceFromReply(ctx) {
    const reference = mediaFromMessage(ctx.message?.reply_to_message);
    if (reference?.type !== "image") return null;
    const media = await this.#downloadMedia(ctx, { ...reference, type: "image" });
    if (!media.mimeType.startsWith("image/")) throw new Error("That reply is not a usable image.");
    if (media.buffer.length > this.config.maxReferenceBytes) {
      throw new Error("That reference image is too large.");
    }
    return imageBufferToDataUrl(media.buffer, media.mimeType);
  }
}
