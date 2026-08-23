import { usageLimits } from "./config.mjs";
import {
  buildAutonomousXMessages,
  buildImagePrompt,
  buildVideoPrompt
} from "./persona.mjs";

const POST_TYPES = new Set(["text", "image", "video"]);
const AUTONOMOUS_USER = "x-autonomous";

function autonomousLimits(config) {
  return {
    hourly: config.xAutonomousHourlyCap,
    daily: config.xAutonomousDailyCap,
    userHourly: config.xAutonomousHourlyCap,
    userDaily: config.xAutonomousDailyCap
  };
}

function cleanPostText(value, maximum) {
  let text = String(value || "")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 $2")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*["“]|["”]\s*$/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const limit = Math.min(240, maximum);
  if (text.length > limit) text = `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
  return text;
}

export class AutonomousXService {
  constructor({
    config,
    store,
    openRouter,
    xClient,
    canonicalReferenceDataUrl,
    fetchImpl = fetch,
    logger = console,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  }) {
    this.config = config;
    this.store = store;
    this.openRouter = openRouter;
    this.xClient = xClient;
    this.canonicalReferenceDataUrl = canonicalReferenceDataUrl;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.timer = null;
    this.running = false;
    this.inFlight = null;
    this.lastResult = null;
  }

  status() {
    return {
      enabled: this.config.xAutonomousPostingEnabled,
      running: this.running,
      intervalMinutes: this.config.xAutonomousIntervalMinutes,
      dailyCap: this.config.xAutonomousDailyCap,
      types: this.config.xAutonomousTypes,
      lastResult: this.lastResult
    };
  }

  start() {
    if (this.running || !this.config.xAutonomousPostingEnabled) return false;
    this.running = true;
    this.#schedule(this.config.xAutonomousStartDelayMinutes * 60_000);
    this.logger.info(
      `[x] autonomous schedule enabled every ${this.config.xAutonomousIntervalMinutes} minutes`
    );
    return true;
  }

  stop() {
    this.running = false;
    if (this.timer) this.clearTimeoutImpl(this.timer);
    this.timer = null;
  }

  async runOnce({ type = null, test = false } = {}) {
    if (this.inFlight) return { ok: false, skipped: true, reason: "already_running" };
    this.inFlight = this.#runOnce({ type, test }).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async #runOnce({ type, test }) {
    try {
      if (!await this.xClient.connected()) {
        return this.#remember({ ok: false, skipped: true, reason: "x_not_connected" });
      }
      if (!await this.openRouter.connected()) {
        return this.#remember({ ok: false, skipped: true, reason: "openrouter_not_connected" });
      }

      const limits = autonomousLimits(this.config);
      const before = this.store.usageStatus("x_auto", AUTONOMOUS_USER, limits);
      const selectedType = POST_TYPES.has(type)
        ? type
        : this.config.xAutonomousTypes[before.daily % this.config.xAutonomousTypes.length];
      const claim = await this.store.claimUsage("x_auto", AUTONOMOUS_USER, limits);
      if (!claim.allowed) {
        return this.#remember({ ok: false, skipped: true, reason: claim.reason, type: selectedType });
      }

      const text = await this.#makePostText(selectedType, test);
      const media = selectedType === "image"
        ? await this.#makeImage(text)
        : selectedType === "video"
          ? await this.#makeVideo(text)
          : null;
      const posted = await this.xClient.post({ text, media });
      return this.#remember({
        ok: true,
        skipped: false,
        type: selectedType,
        test,
        url: posted.url,
        postedAt: new Date().toISOString()
      });
    } catch (error) {
      this.#remember({
        ok: false,
        skipped: false,
        reason: error?.message || "autonomous_post_failed",
        failedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  async #makePostText(type, test) {
    const claim = await this.store.claimUsage(
      "chat",
      AUTONOMOUS_USER,
      usageLimits(this.config, "chat")
    );
    if (!claim.allowed) throw new Error("The shared chat limit blocked autonomous posting.");
    let costUsd = 0;
    try {
      const result = await this.openRouter.chat(buildAutonomousXMessages(type, { test }));
      costUsd = result.costUsd;
      const text = cleanPostText(result.text, this.config.xMaxPostCharacters);
      if (!text) throw new Error("The autonomous post writer returned no text.");
      await this.store.recordCost(claim.eventId, costUsd);
      return text;
    } catch (error) {
      await this.store.recordCost(claim.eventId, costUsd || Number(error?.costUsd) || 0);
      throw error;
    }
  }

  async #makeImage(text) {
    const claim = await this.store.claimUsage(
      "image",
      AUTONOMOUS_USER,
      usageLimits(this.config, "image"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) throw new Error("The shared image limit blocked autonomous posting.");
    let costUsd = 0;
    try {
      const result = await this.openRouter.generateImage({
        prompt: buildImagePrompt(`Create a visual for this X caption: ${text}`),
        referenceDataUrls: [this.canonicalReferenceDataUrl]
      });
      costUsd = result.costUsd;
      if (result.buffer) {
        await this.store.recordCost(claim.eventId, costUsd);
        return { buffer: result.buffer, mimeType: result.mimeType || "image/png", type: "image" };
      }
      const media = await this.#downloadImage(result.url);
      await this.store.recordCost(claim.eventId, costUsd);
      return media;
    } catch (error) {
      await this.store.recordCost(claim.eventId, costUsd || Number(error?.costUsd) || 0);
      throw error;
    }
  }

  async #makeVideo(text) {
    const claim = await this.store.claimUsage(
      "video",
      AUTONOMOUS_USER,
      usageLimits(this.config, "video"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) throw new Error("The shared video limit blocked autonomous posting.");
    let costUsd = 0;
    try {
      const result = await this.openRouter.generateVideo({
        prompt: buildVideoPrompt(`Create a visual for this X caption: ${text}`),
        referenceDataUrl: this.canonicalReferenceDataUrl
      });
      costUsd = result.costUsd;
      await this.store.recordCost(claim.eventId, costUsd);
      return { buffer: result.buffer, mimeType: result.mimeType || "video/mp4", type: "video" };
    } catch (error) {
      await this.store.recordCost(claim.eventId, costUsd || Number(error?.costUsd) || 0);
      throw error;
    }
  }

  async #downloadImage(url) {
    if (!/^https:\/\//i.test(String(url || ""))) throw new Error("The image model returned no usable image.");
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(this.config.openRouterTimeoutMs),
      redirect: "follow"
    });
    if (!response.ok) throw new Error("The generated image could not be downloaded.");
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > this.config.maxImageBytes) throw new Error("The generated image is too large.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > this.config.maxImageBytes) throw new Error("The generated image is too large.");
    const mimeType = response.headers.get("content-type") || "image/png";
    if (!mimeType.startsWith("image/")) throw new Error("The generated image has an invalid format.");
    return { buffer, mimeType, type: "image" };
  }

  #remember(result) {
    this.lastResult = result;
    return result;
  }

  #schedule(delayMs) {
    this.timer = this.setTimeoutImpl(async () => {
      try {
        const result = await this.runOnce();
        if (result.ok) this.logger.info(`[x] autonomous ${result.type} post: ${result.url}`);
        else this.logger.info(`[x] autonomous post skipped: ${result.reason}`);
      } catch (error) {
        this.logger.error("[x] autonomous post failed", error);
      } finally {
        if (this.running) this.#schedule(this.config.xAutonomousIntervalMinutes * 60_000);
      }
    }, delayMs);
    this.timer.unref?.();
  }
}
