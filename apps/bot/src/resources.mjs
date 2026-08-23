import { usageLimits } from "./config.mjs";

function remaining(cap, used) {
  return Math.max(0, Number(cap || 0) - Number(used || 0));
}

function seconds(milliseconds) {
  return Math.max(0, Math.ceil(Number(milliseconds || 0) / 1_000));
}

function publicAvailability(result, { enabled = true, spendCapUsd = 0 } = {}) {
  const status = result.status;
  const globalDailyRemaining = remaining(status.limits.daily, status.daily);
  const globalHourlyRemaining = remaining(status.limits.hourly, status.hourly);
  return {
    enabled,
    availableNow: enabled && result.allowed,
    blockedReason: enabled ? result.reason : "disabled",
    cooldownSecondsRemaining: seconds(result.cooldownRemainingMs),
    global: {
      hourlyUsed: status.hourly,
      hourlyRemaining: globalHourlyRemaining,
      dailyUsed: status.daily,
      dailyRemaining: globalDailyRemaining,
      distinctUsersToday: status.dailyUsers
    },
    currentUser: {
      isNewToday: status.userDaily === 0,
      hourlyUsed: status.userHourly,
      hourlyRemaining: remaining(status.limits.userHourly, status.userHourly),
      dailyUsed: status.userDaily,
      dailyRemaining: remaining(status.limits.userDaily, status.userDaily)
    },
    ...(spendCapUsd > 0 ? {
      sharedSpend: {
        todayUsd: Number(status.spendToday.toFixed(4)),
        capUsd: spendCapUsd,
        remainingUsd: Number(Math.max(0, spendCapUsd - status.spendToday).toFixed(4))
      }
    } : {}),
    scarce: globalHourlyRemaining <= 1 || globalDailyRemaining <= 1
  };
}

export function buildAgentResourceStatus({ store, config, userId }) {
  const image = store.usageAvailability(
    "image",
    userId,
    usageLimits(config, "image"),
    { spendCapUsd: config.mediaDailySpendCapUsd }
  );
  const video = store.usageAvailability(
    "video",
    userId,
    usageLimits(config, "video"),
    { spendCapUsd: config.mediaDailySpendCapUsd }
  );
  const xPost = store.usageAvailability(
    "x_post",
    userId,
    usageLimits(config, "x_post"),
    {
      globalCooldownMs: config.xPostGlobalCooldownSeconds * 1_000,
      userCooldownMs: config.xPostUserCooldownSeconds * 1_000,
      globalCooldownTypes: ["x_auto"]
    }
  );
  const xResearch = store.usageAvailability(
    "x_research",
    userId,
    usageLimits(config, "x_research")
  );
  return {
    image: publicAvailability(image, {
      enabled: config.telegramImagesEnabled,
      spendCapUsd: config.mediaDailySpendCapUsd
    }),
    video: publicAvailability(video, {
      enabled: config.telegramVideosEnabled,
      spendCapUsd: config.mediaDailySpendCapUsd
    }),
    xPost: publicAvailability(xPost, { enabled: config.xPostingEnabled }),
    xResearch: publicAvailability(xResearch, { enabled: config.xPostingEnabled })
  };
}
