function integer(value, fallback, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function number(value, fallback, { minimum = 0, maximum = Number.MAX_VALUE } = {}) {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function boolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function idSet(value) {
  return new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d+$/.test(item)));
}

function enumList(value, fallback, allowed) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => allowed.includes(item));
  return items.length ? [...new Set(items)] : fallback;
}

function stringList(value, fallback, separator = ",") {
  const items = String(value || "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? [...new Set(items)] : fallback;
}

export function createBotConfig(env = process.env) {
  const telegramGroupHandle = String(env.TELEGRAM_GROUP_HANDLE || "StopAiCoin")
    .trim()
    .replace(/^@/, "");
  return {
    telegramToken: env.TELEGRAM_BOT_TOKEN || "",
    requireTelegram: boolean(env.STOPAI_REQUIRE_TELEGRAM, false),
    telegramGroupHandle,
    telegramGroupUrl: `https://t.me/${telegramGroupHandle}`,
    telegramRepliesEnabled: boolean(env.TELEGRAM_REPLIES_ENABLED, true),
    telegramImagesEnabled: boolean(env.TELEGRAM_IMAGES_ENABLED, true),
    telegramVideosEnabled: boolean(env.TELEGRAM_VIDEOS_ENABLED, true),
    telegramOperatorIds: idSet(env.TELEGRAM_OPERATOR_IDS),
    telegramHandlerTimeoutMs: integer(env.TELEGRAM_HANDLER_TIMEOUT_MS, 720_000, {
      minimum: 30_000,
      maximum: 900_000
    }),
    openRouterChatModel: env.OPENROUTER_CHAT_MODEL || "~google/gemini-flash-latest",
    openRouterImageModel:
      env.OPENROUTER_SERVER_IMAGE_MODEL || "google/gemini-3.1-flash-image",
    openRouterVideoModel: env.OPENROUTER_VIDEO_MODEL || "google/veo-3.1-lite",
    openRouterSiteUrl: env.OPENROUTER_SITE_URL || env.PUBLIC_APP_URL || "http://localhost:8080",
    openRouterAppName: env.OPENROUTER_APP_NAME || "STOPAI Telegram Bot",
    openRouterTimeoutMs: integer(env.OPENROUTER_TIMEOUT_MS, 120_000, {
      minimum: 5_000,
      maximum: 900_000
    }),
    videoPollIntervalMs: integer(env.VIDEO_POLL_INTERVAL_MS, 30_000, {
      minimum: 5_000,
      maximum: 60_000
    }),
    videoMaxWaitMs: integer(env.VIDEO_MAX_WAIT_MS, 600_000, {
      minimum: 30_000,
      maximum: 900_000
    }),
    videoDurationSeconds: integer(env.VIDEO_DURATION_SECONDS, 4, {
      minimum: 1,
      maximum: 10
    }),
    videoResolution: env.VIDEO_RESOLUTION || "720p",
    videoAspectRatio: env.VIDEO_ASPECT_RATIO || "1:1",
    chatHourlyCap: integer(env.CHAT_HOURLY_CAP, 30),
    chatDailyCap: integer(env.CHAT_DAILY_CAP, 200),
    chatUserHourlyCap: integer(env.CHAT_USER_HOURLY_CAP, 10),
    chatUserDailyCap: integer(env.CHAT_USER_DAILY_CAP, 50),
    imageHourlyCap: integer(env.IMAGE_HOURLY_CAP, 2),
    imageDailyCap: integer(env.IMAGE_DAILY_CAP, 10),
    imageUserHourlyCap: integer(env.IMAGE_USER_HOURLY_CAP, 1),
    imageUserDailyCap: integer(env.IMAGE_USER_DAILY_CAP, 3),
    videoHourlyCap: integer(env.VIDEO_HOURLY_CAP, 1),
    videoDailyCap: integer(env.VIDEO_DAILY_CAP, 2),
    videoUserHourlyCap: integer(env.VIDEO_USER_HOURLY_CAP, 1),
    videoUserDailyCap: integer(env.VIDEO_USER_DAILY_CAP, 1),
    mediaDailySpendCapUsd: number(env.MEDIA_DAILY_SPEND_CAP_USD, 5),
    xPostingEnabled: boolean(env.X_POSTING_ENABLED, false),
    xUserAccessToken: env.X_USER_ACCESS_TOKEN || "",
    xExpectedUsername: String(env.X_EXPECTED_USERNAME || "STOPAICOIN").trim().replace(/^@/, ""),
    xTimeoutMs: integer(env.X_TIMEOUT_MS, 120_000, {
      minimum: 5_000,
      maximum: 300_000
    }),
    xMaxPostCharacters: integer(env.X_MAX_POST_CHARACTERS, 280, {
      minimum: 1,
      maximum: 280
    }),
    xPostVerifyAttempts: integer(env.X_POST_VERIFY_ATTEMPTS, 3, {
      minimum: 1,
      maximum: 5
    }),
    xPostVerifyDelayMs: integer(env.X_POST_VERIFY_DELAY_MS, 750, {
      minimum: 0,
      maximum: 5_000
    }),
    xPostHourlyCap: integer(env.X_POST_HOURLY_CAP, 2, { minimum: 1, maximum: 24 }),
    xPostDailyCap: integer(env.X_POST_DAILY_CAP, 8, { minimum: 1, maximum: 100 }),
    xPostUserHourlyCap: integer(env.X_POST_USER_HOURLY_CAP, 1, { minimum: 1, maximum: 12 }),
    xPostUserDailyCap: integer(env.X_POST_USER_DAILY_CAP, 3, { minimum: 1, maximum: 24 }),
    xPostGlobalCooldownSeconds: integer(env.X_POST_GLOBAL_COOLDOWN_SECONDS, 3_600, {
      minimum: 30,
      maximum: 24 * 60 * 60
    }),
    xPostUserCooldownSeconds: integer(env.X_POST_USER_COOLDOWN_SECONDS, 14_400, {
      minimum: 30,
      maximum: 24 * 60 * 60
    }),
    xResearchHourlyCap: integer(env.X_RESEARCH_HOURLY_CAP, 20, { minimum: 1, maximum: 100 }),
    xResearchDailyCap: integer(env.X_RESEARCH_DAILY_CAP, 100, { minimum: 1, maximum: 500 }),
    xResearchUserHourlyCap: integer(env.X_RESEARCH_USER_HOURLY_CAP, 5, { minimum: 1, maximum: 30 }),
    xResearchUserDailyCap: integer(env.X_RESEARCH_USER_DAILY_CAP, 20, { minimum: 1, maximum: 100 }),
    xAutonomousPostingEnabled: boolean(env.X_AUTONOMOUS_POSTING_ENABLED, false),
    xAutonomousIntervalMinutes: integer(env.X_AUTONOMOUS_INTERVAL_MINUTES, 120, {
      minimum: 60,
      maximum: 7 * 24 * 60
    }),
    xAutonomousStartDelayMinutes: integer(env.X_AUTONOMOUS_START_DELAY_MINUTES, 15, {
      minimum: 5,
      maximum: 24 * 60
    }),
    xAutonomousHourlyCap: integer(env.X_AUTONOMOUS_HOURLY_CAP, 3, {
      minimum: 1,
      maximum: 6
    }),
    xAutonomousDailyCap: integer(env.X_AUTONOMOUS_DAILY_CAP, 3, {
      minimum: 1,
      maximum: 12
    }),
    xAutonomousTypes: enumList(
      env.X_AUTONOMOUS_TYPES,
      ["text", "image"],
      ["text", "image", "video"]
    ),
    agentResearchEnabled: boolean(env.AGENT_RESEARCH_ENABLED, true),
    agentXQueries: stringList(env.AGENT_X_QUERIES, [
      '("AI race" OR "pause AI" OR "stop AI") lang:en -is:retweet -is:reply -from:STOPAICOIN',
      '(superintelligence OR "frontier AI") (safety OR risk OR governance OR moratorium) lang:en -is:retweet -is:reply -from:STOPAICOIN',
      '(("AI crypto" OR "crypto AI" OR "AI agent") (agent OR compute OR automation OR acceleration)) lang:en -is:retweet -is:reply -from:STOPAICOIN'
    ], ";;"),
    agentWatchAccounts: stringList(env.AGENT_WATCH_ACCOUNTS, [
      "PauseAI"
    ]).map((item) => item.replace(/^@/, "")).filter((item) => /^[A-Za-z0-9_]{1,15}$/.test(item)),
    agentNewsFeeds: stringList(env.AGENT_NEWS_FEEDS, []),
    agentCandidateLimit: integer(env.AGENT_CANDIDATE_LIMIT, 14, {
      minimum: 4,
      maximum: 30
    }),
    agentXResearchHourlyCap: integer(env.AGENT_X_RESEARCH_HOURLY_CAP, 4, {
      minimum: 1,
      maximum: 20
    }),
    agentXResearchDailyCap: integer(env.AGENT_X_RESEARCH_DAILY_CAP, 24, {
      minimum: 1,
      maximum: 100
    }),
    agentMinPostIntervalMinutes: integer(env.AGENT_MIN_POST_INTERVAL_MINUTES, 240, {
      minimum: 60,
      maximum: 7 * 24 * 60
    }),
    agentMaxSourceAgeHours: integer(env.AGENT_MAX_SOURCE_AGE_HOURS, 168, {
      minimum: 1,
      maximum: 30 * 24
    }),
    maxImageBytes: integer(env.MAX_IMAGE_BYTES, 15 * 1024 * 1024),
    maxVideoBytes: integer(env.MAX_VIDEO_BYTES, 48 * 1024 * 1024),
    maxReferenceBytes: integer(env.MAX_REFERENCE_BYTES, 10 * 1024 * 1024)
  };
}

export function usageLimits(config, type) {
  if (type === "chat") {
    return {
      hourly: config.chatHourlyCap,
      daily: config.chatDailyCap,
      userHourly: config.chatUserHourlyCap,
      userDaily: config.chatUserDailyCap
    };
  }
  if (type === "image") {
    return {
      hourly: config.imageHourlyCap,
      daily: config.imageDailyCap,
      userHourly: config.imageUserHourlyCap,
      userDaily: config.imageUserDailyCap
    };
  }
  if (type === "video") {
    return {
      hourly: config.videoHourlyCap,
      daily: config.videoDailyCap,
      userHourly: config.videoUserHourlyCap,
      userDaily: config.videoUserDailyCap
    };
  }
  if (type === "x_post") {
    return {
      hourly: config.xPostHourlyCap,
      daily: config.xPostDailyCap,
      userHourly: config.xPostUserHourlyCap,
      userDaily: config.xPostUserDailyCap
    };
  }
  if (type === "x_research") {
    return {
      hourly: config.xResearchHourlyCap,
      daily: config.xResearchDailyCap,
      userHourly: config.xResearchUserHourlyCap,
      userDaily: config.xResearchUserDailyCap
    };
  }
  if (type === "agent_x_research") {
    return {
      hourly: config.agentXResearchHourlyCap,
      daily: config.agentXResearchDailyCap,
      userHourly: config.agentXResearchHourlyCap,
      userDaily: config.agentXResearchDailyCap
    };
  }
  return { hourly: 0, daily: 0, userHourly: 0, userDaily: 0 };
}
