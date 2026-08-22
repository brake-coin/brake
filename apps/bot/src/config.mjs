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

export function createBotConfig(env = process.env) {
  return {
    telegramToken: env.TELEGRAM_BOT_TOKEN || "",
    requireTelegram: boolean(env.STOPAI_REQUIRE_TELEGRAM, false),
    telegramRepliesEnabled: boolean(env.TELEGRAM_REPLIES_ENABLED, true),
    telegramImagesEnabled: boolean(env.TELEGRAM_IMAGES_ENABLED, true),
    telegramVideosEnabled: boolean(env.TELEGRAM_VIDEOS_ENABLED, true),
    telegramOperatorIds: idSet(env.TELEGRAM_OPERATOR_IDS),
    telegramHandlerTimeoutMs: integer(env.TELEGRAM_HANDLER_TIMEOUT_MS, 720_000, {
      minimum: 30_000,
      maximum: 900_000
    }),
    openRouterChatModel: env.OPENROUTER_CHAT_MODEL || "openrouter/auto",
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
    xTimeoutMs: integer(env.X_TIMEOUT_MS, 120_000, {
      minimum: 5_000,
      maximum: 300_000
    }),
    xMaxPostCharacters: integer(env.X_MAX_POST_CHARACTERS, 280, {
      minimum: 1,
      maximum: 280
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
  return { hourly: 0, daily: 0, userHourly: 0, userDaily: 0 };
}
