import { Telegraf } from "telegraf";

import { usageLimits } from "./config.mjs";
import {
  buildChatMessages,
  buildImagePrompt,
  buildVideoPrompt,
  removeBotMention
} from "./persona.mjs";
import { imageBufferToDataUrl, OpenRouterError } from "./openrouter.mjs";

function commandPrompt(ctx) {
  return String(ctx.message?.text || "").replace(/^\/[a-z]+(?:@[a-z0-9_]+)?\s*/i, "").trim();
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

function limitMessage(type, claim) {
  if (claim.reason === "daily_spend_cap") {
    return "The shared media budget is done for today. BYOK generation on the website still works.";
  }
  return `The shared ${type} limit is reached. Try again after the hourly or daily reset.`;
}

function safeErrorMessage(error) {
  if (error instanceof OpenRouterError) return error.message;
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return "The AI service took too long. Try again.";
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

export class TelegramService {
  constructor({ config, store, openRouter, canonicalReferenceDataUrl, fetchImpl = fetch, logger = console }) {
    this.config = config;
    this.store = store;
    this.openRouter = openRouter;
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
    await this.store.load();
    if (!this.config.telegramToken) {
      this.logger.warn("[telegram] TELEGRAM_BOT_TOKEN is missing; bot is not started");
      return false;
    }
    this.bot = new Telegraf(this.config.telegramToken, {
      handlerTimeout: this.config.telegramHandlerTimeoutMs
    });
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
    await this.bot.telegram.setMyCommands([
      { command: "start", description: "Meet STOPAI" },
      { command: "help", description: "Show bot commands" },
      { command: "image", description: "Make a budgeted STOPAI image" },
      { command: "video", description: "Make a budgeted STOPAI video" },
      { command: "latest", description: "Resend the latest saved media" },
      { command: "status", description: "Show connection and budget status" },
      { command: "whoami", description: "Show your Telegram user ID" }
    ]).catch((error) => this.logger.warn("[telegram] command menu setup failed", error.message));
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

  #registerHandlers() {
    this.bot.start((ctx) => ctx.reply([
      "STOPAI ✋🏻😡",
      "Stop the AI race — peacefully, lawfully, and loudly.",
      "Chat with me, use /image or /video, or send me media to remember. Public website generation stays BYOK."
    ].join("\n")));
    this.bot.help((ctx) => ctx.reply([
      "Chat: message me privately, or mention me in a group.",
      "/image your idea — shared, tightly budgeted image",
      "/video your idea — shared, tightly budgeted short video",
      "Reply to an image with /image or /video to use it as a reference.",
      "/latest — resend the latest image or video saved in this chat",
      "/status — connection and generation limits",
      "/whoami — your numeric Telegram ID",
      "You can also send a BYOK-made image or video here. I save its Telegram file ID, not the file itself."
    ].join("\n")));
    this.bot.command("whoami", (ctx) => ctx.reply(`Your Telegram user ID is ${ctx.from?.id || "unknown"}.`));
    this.bot.command("status", (ctx) => this.#handleStatus(ctx));
    this.bot.command(["image", "meme"], (ctx) => this.#handleImage(ctx));
    this.bot.command("video", (ctx) => this.#handleVideo(ctx));
    this.bot.command("latest", (ctx) => this.#handleLatest(ctx));
    this.bot.on(["photo", "video", "document"], (ctx) => this.#handleIncomingMedia(ctx));
    this.bot.on("text", (ctx) => this.#handleText(ctx));
  }

  async #handleStatus(ctx) {
    const connected = await this.openRouter.connected();
    const userId = ctx.from?.id;
    const image = this.store.usageStatus("image", userId, usageLimits(this.config, "image"));
    const video = this.store.usageStatus("video", userId, usageLimits(this.config, "video"));
    await ctx.reply([
      `Shared AI: ${connected ? "connected" : "not connected"}`,
      `Telegram: ${this.running ? `@${this.botInfo?.username}` : "not running"}`,
      `Images today: ${image.daily}/${image.limits.daily} global; you ${image.userDaily}/${image.limits.userDaily}`,
      `Videos today: ${video.daily}/${video.limits.daily} global; you ${video.userDaily}/${video.limits.userDaily}`,
      `Shared media spend recorded today: $${image.spendToday.toFixed(2)} / $${this.config.mediaDailySpendCapUsd.toFixed(2)}`,
      "Website image generation remains visitor-owned BYOK."
    ].join("\n"));
  }

  async #handleText(ctx) {
    const message = ctx.message;
    if (!message?.text || message.from?.is_bot || message.text.startsWith("/")) return;
    if (!this.config.telegramRepliesEnabled) return;
    if (!isAddressed({
      message,
      chatType: ctx.chat?.type,
      botUsername: this.botInfo?.username,
      botId: this.botInfo?.id
    })) return;

    const userText = removeBotMention(message.text, this.botInfo?.username);
    if (!userText) return;
    if (!await this.openRouter.connected()) {
      await ctx.reply("The shared OpenRouter account is not connected yet.");
      return;
    }
    const limits = usageLimits(this.config, "chat");
    const claim = await this.store.claimUsage("chat", ctx.from?.id, limits);
    if (!claim.allowed) {
      await ctx.reply(limitMessage("chat", claim));
      return;
    }
    const history = this.store.recentMessages(ctx.chat.id);
    await this.store.recordMessage({ chatId: ctx.chat.id, role: "user", content: userText });
    await ctx.sendChatAction("typing").catch(() => {});
    try {
      const result = await this.openRouter.chat(buildChatMessages(history, userText));
      await this.store.recordCost(claim.eventId, result.costUsd);
      await this.store.recordMessage({ chatId: ctx.chat.id, role: "assistant", content: result.text });
      await ctx.reply(result.text.slice(0, 3_900));
    } catch (error) {
      this.logger.error("[telegram] chat failed", error);
      await ctx.reply(safeErrorMessage(error));
    }
  }

  async #handleImage(ctx) {
    if (!this.config.telegramImagesEnabled) {
      await ctx.reply("Shared image generation is turned off. The website BYOK studio still works.");
      return;
    }
    const prompt = commandPrompt(ctx);
    if (!prompt) {
      await ctx.reply("Use /image followed by an idea. You can also reply to an image with the command.");
      return;
    }
    if (!await this.openRouter.connected()) {
      await ctx.reply("Shared AI is not connected. The website BYOK studio still works.");
      return;
    }
    const claim = await this.store.claimUsage(
      "image",
      ctx.from?.id,
      usageLimits(this.config, "image"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) {
      await ctx.reply(limitMessage("image", claim));
      return;
    }
    await ctx.reply("Putting the weird hand to work…");
    await ctx.sendChatAction("upload_photo").catch(() => {});
    try {
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
      if (fileId) {
        await this.store.recordMedia({
          chatId: ctx.chat.id,
          userId: ctx.from?.id,
          type: "image",
          fileId,
          caption: prompt,
          source: "shared-openrouter"
        });
      }
    } catch (error) {
      this.logger.error("[telegram] image failed", error);
      await ctx.reply(safeErrorMessage(error));
    }
  }

  async #handleVideo(ctx) {
    if (!this.config.telegramVideosEnabled) {
      await ctx.reply("Shared video generation is turned off.");
      return;
    }
    const prompt = commandPrompt(ctx);
    if (!prompt) {
      await ctx.reply("Use /video followed by an idea. You can reply to an image to animate from it.");
      return;
    }
    if (!await this.openRouter.connected()) {
      await ctx.reply("Shared AI is not connected. You can still upload and reuse BYOK media.");
      return;
    }
    const claim = await this.store.claimUsage(
      "video",
      ctx.from?.id,
      usageLimits(this.config, "video"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) {
      await ctx.reply(limitMessage("video", claim));
      return;
    }
    await ctx.reply("Starting a short STOPAI clip. This can take several minutes…");
    await ctx.sendChatAction("upload_video").catch(() => {});
    try {
      const referenceDataUrl = await this.#referenceFromReply(ctx)
        || this.canonicalReferenceDataUrl;
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
      if (fileId) {
        await this.store.recordMedia({
          chatId: ctx.chat.id,
          userId: ctx.from?.id,
          type: "video",
          fileId,
          caption: prompt,
          source: "shared-openrouter"
        });
      }
    } catch (error) {
      this.logger.error("[telegram] video failed", error);
      await ctx.reply(safeErrorMessage(error));
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
    await this.store.recordMedia({
      chatId: ctx.chat.id,
      userId: ctx.from?.id,
      type: media.type,
      fileId: media.fileId,
      caption: ctx.message.caption || "",
      source: "telegram-upload"
    });
    await ctx.reply(`Saved that ${media.type} in this chat. Use /latest to bring it back.`);
  }

  async #handleLatest(ctx) {
    const media = this.store.latestMedia(ctx.chat.id);
    if (!media) {
      await ctx.reply("No saved image or video in this chat yet.");
      return;
    }
    const options = media.caption ? { caption: media.caption.slice(0, 900) } : {};
    if (media.type === "video") await ctx.replyWithVideo(media.fileId, options);
    else await ctx.replyWithPhoto(media.fileId, options);
  }

  async #referenceFromReply(ctx) {
    const reference = mediaFromMessage(ctx.message?.reply_to_message);
    if (reference?.type !== "image") return null;
    let response;
    try {
      const fileUrl = await ctx.telegram.getFileLink(reference.fileId);
      response = await this.fetchImpl(fileUrl, {
        signal: AbortSignal.timeout(30_000),
        redirect: "follow"
      });
    } catch {
      throw new Error("Telegram could not load the reference image.");
    }
    if (!response.ok) throw new Error("Telegram could not load the reference image.");
    const size = Number(response.headers.get("content-length") || 0);
    if (size > this.config.maxReferenceBytes) throw new Error("That reference image is too large.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > this.config.maxReferenceBytes) throw new Error("That reference image is too large.");
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    if (!mimeType.startsWith("image/")) throw new Error("That reply is not a usable image.");
    return imageBufferToDataUrl(buffer, mimeType);
  }
}
