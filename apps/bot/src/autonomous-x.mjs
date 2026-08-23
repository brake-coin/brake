import { usageLimits } from "./config.mjs";
import {
  buildAgentDecisionMessages,
  buildAutonomousXMessages,
  buildImagePrompt,
  buildVideoPrompt,
  DEFAULT_AGENT_GOALS
} from "./persona.mjs";
import {
  DEFAULT_NEWS_FEEDS,
  NewsResearchClient,
  xPostResearchItem
} from "./research.mjs";
import { buildAgentResourceStatus } from "./resources.mjs";
import { validateXQuoteSource, xPostReference, xWeightedLength } from "./x.mjs";

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

function cleanPostText(value, maximum = 240) {
  let text = String(value || "")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 $2")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*["“]|["”]\s*$/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const limit = Math.min(240, maximum);
  if ([...text].length > limit) text = `${[...text].slice(0, Math.max(1, limit - 1)).join("").trimEnd()}…`;
  return text;
}

function postTextWithSource(value, sourceUrl, maximum) {
  const source = /^https:\/\//i.test(String(sourceUrl || "")) ? String(sourceUrl) : "";
  let caption = cleanPostText(value, 220)
    .replace(/@[A-Za-z0-9_]{1,15}\b/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!caption) throw new Error("The autonomous post needs original commentary, not only a source link.");
  if (!source) return caption;
  let combined = `${caption}\n\n${source}`;
  while (caption && xWeightedLength(combined) > maximum) {
    const characters = [...caption];
    characters.splice(Math.max(0, characters.length - 8));
    caption = `${characters.join("").trimEnd()}…`;
    combined = `${caption}\n\n${source}`;
  }
  return combined;
}

function jsonDecision(value) {
  const raw = String(value || "").trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("The campaign agent returned an invalid decision.");
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(first, last + 1));
  } catch {
    throw new Error("The campaign agent returned an invalid decision.");
  }
  const action = parsed?.action === "post" ? "post" : "skip";
  return {
    action,
    reason: String(parsed?.reason || "No reason supplied.").slice(0, 500),
    sourceKey: String(parsed?.source_key || "").slice(0, 200),
    type: POST_TYPES.has(parsed?.media_type) ? parsed.media_type : "image",
    text: cleanPostText(parsed?.post_text, 190),
    mediaPrompt: String(parsed?.media_prompt || "").trim().slice(0, 1_000),
    topic: String(parsed?.topic || "").trim().slice(0, 120)
  };
}

function publicCandidate(item) {
  return {
    key: item.key,
    kind: item.kind,
    title: item.title,
    url: item.url,
    author: item.author || null,
    publisher: item.publisher || null,
    publishedAt: item.publishedAt || null,
    score: item.score || 0,
    seenCount: item.seenCount || 1,
    summary: item.kind === "news" ? item.summary || "" : "",
    metrics: item.kind === "x" ? item.metrics || null : null
  };
}

function isFreshCandidate(item, now, maximumAgeHours) {
  const publishedAt = new Date(item?.publishedAt || 0).getTime();
  if (!Number.isFinite(publishedAt) || publishedAt <= 0) return false;
  const ageMs = now.getTime() - publishedAt;
  return ageMs >= -5 * 60_000 && ageMs <= maximumAgeHours * 3_600_000;
}

export class AutonomousXService {
  constructor({
    config,
    store,
    openRouter,
    xClient,
    canonicalReferenceDataUrl,
    newsResearch = null,
    fetchImpl = fetch,
    logger = console,
    now = () => new Date(),
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
    this.now = now;
    this.newsResearch = newsResearch || new NewsResearchClient({
      feedUrls: config.agentNewsFeeds.length ? config.agentNewsFeeds : DEFAULT_NEWS_FEEDS,
      fetchImpl,
      timeoutMs: Math.min(config.xTimeoutMs, 30_000),
      logger,
      now
    });
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
      researchEnabled: this.config.agentResearchEnabled,
      minPostIntervalMinutes: this.config.agentMinPostIntervalMinutes,
      maxSourceAgeHours: this.config.agentMaxSourceAgeHours,
      watchAccounts: this.config.agentWatchAccounts,
      newsFeedCount: this.newsResearch.feedUrls.length,
      memory: this.store.agentStatus?.() || {
        goalCount: 0,
        memoryCount: 0,
        researchCount: 0,
        lastResearchAt: null,
        lastCycle: null
      },
      lastResult: this.lastResult
    };
  }

  start() {
    if (this.running || !this.config.xAutonomousPostingEnabled) return false;
    this.running = true;
    this.#schedule(this.config.xAutonomousStartDelayMinutes * 60_000);
    this.logger.info(
      `[agent] research and decision cycle enabled every ${this.config.xAutonomousIntervalMinutes} minutes`
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
    let postingClaim = null;
    let sourceClaim = null;
    let createdPost = null;
    try {
      await this.store.load();
      await this.store.ensureAgentGoals(DEFAULT_AGENT_GOALS);
      if (!await this.xClient.connected()) {
        return this.#finish({ ok: false, skipped: true, action: "skip", reason: "x_not_connected" });
      }
      if (!await this.openRouter.connected()) {
        return this.#finish({ ok: false, skipped: true, action: "skip", reason: "openrouter_not_connected" });
      }
      if (test) return await this.#runTest(type);

      const postingAvailability = this.store.usageAvailability(
        "x_auto",
        AUTONOMOUS_USER,
        autonomousLimits(this.config),
        {
          globalCooldownMs: this.config.agentMinPostIntervalMinutes * 60_000,
          globalCooldownTypes: ["x_post"]
        }
      );
      if (!postingAvailability.allowed) {
        return this.#finish({
          ok: true,
          skipped: true,
          action: "skip",
          reason: postingAvailability.reason
        });
      }

      const resources = buildAgentResourceStatus({
        store: this.store,
        config: this.config,
        userId: AUTONOMOUS_USER
      });
      const allowedTypes = this.config.xAutonomousTypes.filter((mediaType) => (
        mediaType === "text" || resources[mediaType]?.availableNow
      ));
      if (!allowedTypes.length) {
        return this.#finish({
          ok: true,
          skipped: true,
          action: "skip",
          reason: "No configured post type has shared capacity right now."
        });
      }

      const candidates = this.config.agentResearchEnabled ? await this.#research() : [];
      if (!candidates.length) {
        return this.#finish({
          ok: true,
          skipped: true,
          action: "skip",
          reason: "No fresh, unused research candidate was available."
        });
      }
      const decision = await this.#decide(candidates, { resources, allowedTypes });
      if (decision.action !== "post") {
        return this.#finish({
          ok: true,
          skipped: true,
          action: "skip",
          reason: decision.reason
        });
      }
      const source = candidates.find((candidate) => candidate.key === decision.sourceKey);
      if (!source || !decision.text) {
        return this.#finish({
          ok: true,
          skipped: true,
          action: "skip",
          reason: "The proposed post did not select a valid research source."
        });
      }
      const selectedType = allowedTypes.includes(decision.type)
        ? decision.type
        : allowedTypes[0];
      let verifiedSource = source;
      if (source.kind === "x") {
        const post = validateXQuoteSource(await this.xClient.readPost(source.url), {
          expectedUsername: this.config.xExpectedUsername
        });
        if (!isFreshCandidate({ publishedAt: post.createdAt }, this.now(), this.config.agentMaxSourceAgeHours)) {
          throw new Error(`The selected X source is older than ${this.config.agentMaxSourceAgeHours} hours.`);
        }
        const reference = xPostReference(post.url);
        if (!reference || `x:${reference.id}` !== source.key) {
          throw new Error("The selected X source did not match the research candidate.");
        }
        verifiedSource = { ...source, url: post.url, author: post.author.username };
        sourceClaim = await this.store.claimXSourcePost({
          sourcePostId: reference.id,
          sourcePostUrl: post.url,
          userId: AUTONOMOUS_USER
        });
        if (!sourceClaim.allowed) {
          return this.#finish({
            ok: true,
            skipped: true,
            action: "skip",
            reason: sourceClaim.reason,
            sourceKey: source.key,
            type: selectedType
          });
        }
      }
      postingClaim = await this.store.claimUsage(
        "x_auto",
        AUTONOMOUS_USER,
        autonomousLimits(this.config),
        {
          globalCooldownMs: this.config.agentMinPostIntervalMinutes * 60_000,
          globalCooldownTypes: ["x_post"]
        }
      );
      if (!postingClaim.allowed) {
        if (sourceClaim?.claimId) await this.store.releaseXSourcePost(sourceClaim.claimId);
        return this.#finish({
          ok: true,
          skipped: true,
          action: "skip",
          reason: postingClaim.reason,
          sourceKey: source.key,
          type: selectedType
        });
      }

      const text = postTextWithSource(decision.text, verifiedSource.url, this.config.xMaxPostCharacters);
      const media = selectedType === "image"
        ? await this.#makeImage(text, decision.mediaPrompt)
        : selectedType === "video"
          ? await this.#makeVideo(text, decision.mediaPrompt)
          : null;
      const posted = await this.xClient.post({ text, media });
      createdPost = posted;
      if (!posted?.verified || !posted?.id) {
        throw new Error("X did not return a verified publishing receipt.");
      }
      if (sourceClaim?.claimId) {
        await this.store.confirmXSourcePost(sourceClaim.claimId, {
          postedId: posted.id,
          postedUrl: posted.url
        });
      }
      postingClaim = null;
      await this.store.recordXReceipt({
        status: "confirmed",
        id: posted.id,
        url: posted.url,
        source: "autonomous-agent",
        userId: AUTONOMOUS_USER,
        text,
        sourcePostId: source.kind === "x" ? source.key.slice(2) : "",
        sourcePostUrl: source.kind === "x" ? verifiedSource.url : ""
      });
      await this.store.markResearchUsed(source.key, { postedUrl: posted.url });
      await this.store.rememberAgent({
        kind: "autonomous-x-post",
        text: `Posted: ${text}`,
        topic: decision.topic || source.title,
        sourceKey: source.key,
        sourceUrl: source.url
      });
      return this.#finish({
        ok: true,
        skipped: false,
        action: "post",
        type: selectedType,
        sourceKey: source.key,
        sourceUrl: verifiedSource.url,
        url: posted.url,
        postedAt: this.now().toISOString()
      });
    } catch (error) {
      if (postingClaim?.eventId) {
        await this.store.recordXReceipt({
          status: "failed",
          id: error?.postId || createdPost?.id,
          url: error?.candidateUrl || createdPost?.url,
          source: "autonomous-agent",
          userId: AUTONOMOUS_USER,
          sourcePostId: sourceClaim?.record?.sourcePostId,
          sourcePostUrl: sourceClaim?.record?.sourcePostUrl,
          error: error?.message || "Autonomous X posting failed."
        }).catch(() => {});
      }
      if (postingClaim?.eventId) await this.store.releaseUsage(postingClaim.eventId).catch(() => {});
      if (sourceClaim?.claimId) {
        await this.store.releaseXSourcePost(sourceClaim.claimId, {
          uncertainPostId: error?.postId || createdPost?.id,
          uncertainPostUrl: error?.candidateUrl || createdPost?.url
        }).catch(() => {});
      }
      await this.#finish({
        ok: false,
        skipped: false,
        action: "error",
        reason: error?.message || "autonomous_post_failed"
      });
      throw error;
    }
  }

  async #runTest(type) {
    const selectedType = POST_TYPES.has(type) ? type : "text";
    const claim = await this.store.claimUsage(
      "x_auto",
      AUTONOMOUS_USER,
      autonomousLimits(this.config),
      {
        globalCooldownMs: this.config.agentMinPostIntervalMinutes * 60_000,
        globalCooldownTypes: ["x_post"]
      }
    );
    if (!claim.allowed) {
      return this.#finish({ ok: false, skipped: true, action: "skip", reason: claim.reason, type: selectedType });
    }
    try {
      const text = await this.#makeTestPostText(selectedType);
      const media = selectedType === "image"
        ? await this.#makeImage(text, "Live STOPAI systems test")
        : selectedType === "video"
          ? await this.#makeVideo(text, "Live STOPAI systems test")
          : null;
      const posted = await this.xClient.post({ text, media });
      if (!posted?.verified || !posted?.id) {
        throw new Error("X did not return a verified publishing receipt.");
      }
      await this.store.recordXReceipt({
        status: "confirmed",
        id: posted.id,
        url: posted.url,
        source: "admin-live-test",
        userId: AUTONOMOUS_USER,
        text
      });
      return this.#finish({
        ok: true,
        skipped: false,
        action: "post",
        type: selectedType,
        test: true,
        url: posted.url,
        postedAt: this.now().toISOString()
      });
    } catch (error) {
      await this.store.recordXReceipt({
        status: "failed",
        id: error?.postId,
        url: error?.candidateUrl,
        source: "admin-live-test",
        userId: AUTONOMOUS_USER,
        error: error?.message || "X live test failed."
      }).catch(() => {});
      await this.store.releaseUsage(claim.eventId).catch(() => {});
      throw error;
    }
  }

  async #research() {
    const items = [];
    const cycleCount = this.store.agentStatus().cycleCount;
    const watched = this.config.agentWatchAccounts.length
      ? [this.config.agentWatchAccounts[cycleCount % this.config.agentWatchAccounts.length]]
      : [];
    const queries = this.config.agentXQueries.length
      ? [this.config.agentXQueries[cycleCount % this.config.agentXQueries.length]]
      : [];
    for (const username of watched) {
      const result = await this.#xResearchCall(() => this.xClient.userPosts(username, 6));
      for (const post of result?.posts || []) {
        if (post.isReply || post.isRepost || post.isQuote || post.possiblySensitive
          || post.author?.username?.toLowerCase() === this.config.xExpectedUsername.toLowerCase()) continue;
        items.push(xPostResearchItem(post, {
          priority: username.toLowerCase() === "canadabirdie" ? 2 : 1,
          now: this.now()
        }));
      }
    }
    for (const query of queries) {
      const posts = await this.#xResearchCall(() => this.xClient.searchRecent(query, 8));
      for (const post of posts || []) {
        if (post.isReply || post.isRepost || post.isQuote || post.possiblySensitive
          || post.author?.username?.toLowerCase() === this.config.xExpectedUsername.toLowerCase()) continue;
        items.push(xPostResearchItem(post, { now: this.now() }));
      }
    }
    items.push(...await this.newsResearch.latest({ limit: 20 }));
    await this.store.recordResearch(items);
    return this.store.agentSnapshot({ researchLimit: 50 }).research
      .filter((item) => !item.usedAt && !item.isReply && !item.isRepost && !item.isQuote
        && !item.possiblySensitive
        && item.author?.toLowerCase() !== this.config.xExpectedUsername.toLowerCase()
        && isFreshCandidate(item, this.now(), this.config.agentMaxSourceAgeHours))
      .slice(0, this.config.agentCandidateLimit)
      .map(publicCandidate);
  }

  async #xResearchCall(task) {
    const claim = await this.store.claimUsage(
      "agent_x_research",
      AUTONOMOUS_USER,
      usageLimits(this.config, "agent_x_research")
    );
    if (!claim.allowed) {
      this.logger.info(`[agent] X research skipped: ${claim.reason}`);
      return null;
    }
    try {
      return await task();
    } catch (error) {
      await this.store.releaseUsage(claim.eventId).catch(() => {});
      this.logger.warn("[agent] X research call failed", error.message);
      return null;
    }
  }

  async #decide(candidates, { resources, allowedTypes }) {
    const claim = await this.store.claimUsage(
      "chat",
      AUTONOMOUS_USER,
      usageLimits(this.config, "chat")
    );
    if (!claim.allowed) throw new Error("The shared chat limit blocked the campaign agent.");
    let costUsd = 0;
    try {
      const result = await this.openRouter.chat(buildAgentDecisionMessages({
        candidates,
        agent: this.store.agentSnapshot(),
        allowedTypes,
        resources,
        now: this.now()
      }));
      costUsd = result.costUsd;
      await this.store.recordCost(claim.eventId, costUsd);
      return jsonDecision(result.text);
    } catch (error) {
      await this.store.recordCost(claim.eventId, costUsd || Number(error?.costUsd) || 0);
      throw error;
    }
  }

  async #makeTestPostText(type) {
    const claim = await this.store.claimUsage(
      "chat",
      AUTONOMOUS_USER,
      usageLimits(this.config, "chat")
    );
    if (!claim.allowed) throw new Error("The shared chat limit blocked autonomous posting.");
    let costUsd = 0;
    try {
      const result = await this.openRouter.chat(buildAutonomousXMessages(type, { test: true }));
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

  async #makeImage(text, mediaPrompt) {
    const claim = await this.store.claimUsage(
      "image",
      AUTONOMOUS_USER,
      usageLimits(this.config, "image"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) throw new Error("The shared image limit blocked autonomous posting.");
    let costUsd = 0;
    try {
      const idea = mediaPrompt || `Create a visual for this X caption: ${text}`;
      const result = await this.openRouter.generateImage({
        prompt: buildImagePrompt(idea),
        referenceDataUrls: [this.canonicalReferenceDataUrl]
      });
      costUsd = result.costUsd;
      if (result.buffer) {
        await this.store.recordCost(claim.eventId, costUsd);
        return {
          buffer: result.buffer,
          mimeType: result.mimeType || "image/png",
          type: "image",
          altText: idea
        };
      }
      const media = await this.#downloadImage(result.url);
      await this.store.recordCost(claim.eventId, costUsd);
      return { ...media, altText: idea };
    } catch (error) {
      await this.store.recordCost(claim.eventId, costUsd || Number(error?.costUsd) || 0);
      throw error;
    }
  }

  async #makeVideo(text, mediaPrompt) {
    const claim = await this.store.claimUsage(
      "video",
      AUTONOMOUS_USER,
      usageLimits(this.config, "video"),
      { spendCapUsd: this.config.mediaDailySpendCapUsd }
    );
    if (!claim.allowed) throw new Error("The shared video limit blocked autonomous posting.");
    let costUsd = 0;
    try {
      const idea = mediaPrompt || `Create a visual for this X caption: ${text}`;
      const result = await this.openRouter.generateVideo({
        prompt: buildVideoPrompt(idea),
        referenceDataUrl: this.canonicalReferenceDataUrl
      });
      costUsd = result.costUsd;
      await this.store.recordCost(claim.eventId, costUsd);
      return {
        buffer: result.buffer,
        mimeType: result.mimeType || "video/mp4",
        type: "video",
        altText: idea
      };
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

  async #finish(result) {
    this.lastResult = result;
    await this.store.recordAgentCycle(result).catch((error) => {
      this.logger.error("[agent] could not save cycle history", error);
    });
    return result;
  }

  #schedule(delayMs) {
    this.timer = this.setTimeoutImpl(async () => {
      try {
        const result = await this.runOnce();
        if (result.ok && !result.skipped) this.logger.info(`[agent] autonomous ${result.type} post: ${result.url}`);
        else this.logger.info(`[agent] cycle ${result.action || "skip"}: ${result.reason}`);
      } catch (error) {
        this.logger.error("[agent] autonomous cycle failed", error);
      } finally {
        if (this.running) this.#schedule(this.config.xAutonomousIntervalMinutes * 60_000);
      }
    }, delayMs);
    this.timer.unref?.();
  }
}
