if (window.location.hostname.endsWith("github.io")) {
  window.location.replace(`https://stopai-coin.fly.dev/admin${window.location.search}`);
  await new Promise(() => {});
}

const panels = {
  loading: document.querySelector("#admin-loading"),
  login: document.querySelector("#admin-login"),
  unconfigured: document.querySelector("#admin-unconfigured"),
  dashboard: document.querySelector("#admin-dashboard")
};
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginMessage = document.querySelector("#login-message");
const adminMessage = document.querySelector("#admin-message");
const connectionTitle = document.querySelector("#connection-title");
const connectionDot = document.querySelector("#connection-dot");
const connectionDetails = document.querySelector("#connection-details");
const connectionCopy = document.querySelector("#connection-copy");
const connectButton = document.querySelector("#connect-openrouter");
const disconnectButton = document.querySelector("#disconnect-openrouter");
const telegramForm = document.querySelector("#telegram-form");
const telegramToken = document.querySelector("#telegram-token");
const telegramTitle = document.querySelector("#telegram-title");
const telegramDot = document.querySelector("#telegram-dot");
const telegramCopy = document.querySelector("#telegram-copy");
const telegramMessage = document.querySelector("#telegram-message");
const connectTelegram = document.querySelector("#connect-telegram");
const disconnectTelegram = document.querySelector("#disconnect-telegram");
const xForm = document.querySelector("#x-form");
const xClientId = document.querySelector("#x-client-id");
const xTitle = document.querySelector("#x-title");
const xDot = document.querySelector("#x-dot");
const xCopy = document.querySelector("#x-copy");
const xDetails = document.querySelector("#x-details");
const xAccount = document.querySelector("#x-account");
const xLinkedAt = document.querySelector("#x-linked-at");
const xTokenExpiry = document.querySelector("#x-token-expiry");
const xCallbackUrl = document.querySelector("#x-callback-url");
const xMessage = document.querySelector("#x-message");
const connectX = document.querySelector("#connect-x");
const disconnectX = document.querySelector("#disconnect-x");
const xAutomation = document.querySelector("#x-automation");
const xAutomationCopy = document.querySelector("#x-automation-copy");
const xTestButtons = [...document.querySelectorAll("[data-x-test]")];

function showOnly(name) {
  for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The admin service did not respond.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function renderConnection(status) {
  showOnly("dashboard");
  connectionDetails.hidden = !status.connected;
  disconnectButton.hidden = !status.connected;
  connectionDot.dataset.connected = status.connected ? "true" : "false";
  connectionTitle.textContent = status.connected ? "Connected" : "Not connected";
  connectButton.textContent = status.connected ? "Reconnect OpenRouter" : "Connect OpenRouter";
  connectionCopy.textContent = status.connected
    ? "Shared Telegram chat and budgeted media can use this connection. The public website stays BYOK."
    : "Connect OpenRouter to power the shared Telegram bot.";

  const telegram = status.telegram || {};
  telegramDot.dataset.connected = telegram.running ? "true" : "false";
  telegramTitle.textContent = telegram.running && telegram.username
    ? `@${telegram.username}`
    : telegram.configured ? "Configured, not running" : "Token not set";
  connectTelegram.textContent = telegram.configured ? "Replace bot token" : "Connect bot";
  disconnectTelegram.hidden = telegram.source !== "admin";
  telegramCopy.textContent = telegram.running
    ? "Verified and listening. Replace the token here if BotFather rotates it."
    : telegram.source === "environment"
      ? "Configured through a Fly secret. Admin replacement is available."
      : telegram.configured
        ? "The token is saved, but polling is not running. Check the bot token or logs."
        : "Paste the token from BotFather. It will be verified before it is stored.";

  if (status.connected) {
    document.querySelector("#key-fingerprint").textContent = `${status.keyFingerprint}…`;
    document.querySelector("#linked-at").textContent = new Date(status.linkedAt).toLocaleString();
    document.querySelector("#openrouter-user").textContent = status.userId || "Not supplied";
    document.querySelector("#key-settings-link").href = status.settingsUrl;
    document.querySelector("#key-activity-link").href = status.activityUrl;
  }

  const x = status.x || {};
  const xConnected = Boolean(x.connected && x.postingEnabled);
  xDot.dataset.connected = xConnected ? "true" : "false";
  xTitle.textContent = x.user?.username
    ? `@${x.user.username}`
    : x.connected ? "Connected" : "Not connected";
  xDetails.hidden = !x.connected;
  disconnectX.hidden = x.source !== "admin";
  connectX.textContent = x.connected ? "Reconnect @STOPAICOIN" : "Connect @STOPAICOIN";
  xClientId.required = !x.connected;
  xCallbackUrl.textContent = x.callbackUrl || "https://stopai-coin.fly.dev/admin/x/callback";
  xCopy.textContent = xConnected
    ? "Ready for cooldown-limited Telegram agent posts and bounded autonomous posts. Access renews automatically."
    : x.connected
      ? "The credential exists, but posting is disabled by the server setting."
      : `Connect @${x.expectedUsername || "STOPAICOIN"} through OAuth PKCE.`;
  if (x.connected) {
    xAccount.textContent = x.user?.username ? `@${x.user.username}` : "Environment token";
    xLinkedAt.textContent = x.linkedAt ? new Date(x.linkedAt).toLocaleString() : "Not supplied";
    xTokenExpiry.textContent = x.expiresAt
      ? `${new Date(x.expiresAt).toLocaleString()} (automatic)`
      : "Managed outside admin";
  }
  const automation = x.automation || {};
  xAutomation.hidden = !xConnected;
  const memory = automation.memory || {};
  const lastCycle = memory.lastCycle;
  xAutomationCopy.textContent = automation.enabled
    ? [
        `Researching every ${automation.intervalMinutes || 120} minutes and posting at most ${automation.dailyCap || 3} times per UTC day.`,
        `Minimum ${automation.minPostIntervalMinutes || 240} minutes between autonomous posts.`,
        `Sources must be no older than ${automation.maxSourceAgeHours || 168} hours.`,
        `Watching: ${(automation.watchAccounts || []).map((name) => `@${name}`).join(", ") || "configured X searches"}.`,
        `Durable state: ${memory.goalCount || 0} goals, ${memory.memoryCount || 0} memories, ${memory.researchCount || 0} research items, ${memory.quotedSourceCount || 0} used X sources, ${memory.uncertainSourceCount || 0} uncertain.`,
        lastCycle ? `Last cycle: ${lastCycle.action} — ${lastCycle.reason || lastCycle.url || "complete"}.` : "No research cycle has completed yet."
      ].join(" ")
    : "The persistent campaign agent is disabled. Live admin tests remain available.";
  for (const button of xTestButtons) button.disabled = !xConnected || !status.connected;
}

async function refreshStatus() {
  try {
    renderConnection(await api("./api/admin/status"));
  } catch (error) {
    if (error.status === 401) showOnly("login");
    else if (error.status === 503) showOnly("unconfigured");
    else {
      showOnly("login");
      loginMessage.textContent = error.message;
    }
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Signing in…";
  try {
    await api("./api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });
    passwordInput.value = "";
    await refreshStatus();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

connectButton.addEventListener("click", async () => {
  adminMessage.textContent = "Opening OpenRouter…";
  connectButton.disabled = true;
  try {
    const result = await api("./api/admin/openrouter/start", { method: "POST" });
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    adminMessage.textContent = error.message;
    connectButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", async () => {
  if (!window.confirm("Disconnect the shared bot from OpenRouter?")) return;
  adminMessage.textContent = "Disconnecting…";
  try {
    await api("./api/admin/openrouter/disconnect", { method: "POST" });
    await refreshStatus();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

telegramForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  telegramMessage.textContent = "Checking the token with Telegram…";
  connectTelegram.disabled = true;
  try {
    await api("./api/admin/telegram/connect", {
      method: "POST",
      body: JSON.stringify({ token: telegramToken.value.trim() })
    });
    telegramToken.value = "";
    telegramMessage.textContent = "Telegram bot connected.";
    await refreshStatus();
  } catch (error) {
    telegramMessage.textContent = error.message;
  } finally {
    connectTelegram.disabled = false;
  }
});

disconnectTelegram.addEventListener("click", async () => {
  if (!window.confirm("Disconnect and remove the saved Telegram bot token?")) return;
  telegramMessage.textContent = "Disconnecting bot…";
  try {
    await api("./api/admin/telegram/disconnect", { method: "POST" });
    telegramToken.value = "";
    telegramMessage.textContent = "Telegram bot disconnected.";
    await refreshStatus();
  } catch (error) {
    telegramMessage.textContent = error.message;
  }
});

xForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  xMessage.textContent = "Opening X authorization…";
  connectX.disabled = true;
  try {
    const result = await api("./api/admin/x/start", {
      method: "POST",
      body: JSON.stringify({ clientId: xClientId.value.trim() })
    });
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    xMessage.textContent = error.message;
    connectX.disabled = false;
  }
});

disconnectX.addEventListener("click", async () => {
  if (!window.confirm("Disconnect STOPAI from X and remove its saved OAuth tokens?")) return;
  xMessage.textContent = "Disconnecting X…";
  try {
    await api("./api/admin/x/disconnect", { method: "POST" });
    xClientId.value = "";
    xMessage.textContent = "X disconnected.";
    await refreshStatus();
  } catch (error) {
    xMessage.textContent = error.message;
  }
});

for (const button of xTestButtons) {
  button.addEventListener("click", async () => {
    const type = button.dataset.xTest;
    xMessage.textContent = `Generating and publishing the live ${type} test…`;
    for (const item of xTestButtons) item.disabled = true;
    try {
      const result = await api("./api/admin/x/post-test", {
        method: "POST",
        body: JSON.stringify({ type })
      });
      xMessage.textContent = `Posted live ${type} test: ${result.result.url}`;
      await refreshStatus();
    } catch (error) {
      xMessage.textContent = error.message;
      await refreshStatus();
    }
  });
}

document.querySelector("#admin-logout").addEventListener("click", async () => {
  await api("./api/admin/logout", { method: "POST" });
  telegramToken.value = "";
  xClientId.value = "";
  showOnly("login");
});

const oauthResult = new URLSearchParams(window.location.search).get("oauth");
if (oauthResult) {
  const messages = {
    connected: "OpenRouter connected to the shared bot.",
    expired: "That connection attempt expired. Please try again.",
    failed: "OpenRouter could not be connected. Please try again.",
    x_connected: "X connected. The Telegram agent and bounded schedule can now publish.",
    x_expired: "That X connection attempt expired. Please try again.",
    x_failed: "X could not be connected. Check the Client ID, callback URL, and app permissions.",
    x_wrong_account: "X refused the connection because it was not authorized as @STOPAICOIN."
  };
  adminMessage.textContent = messages[oauthResult] || "";
  window.history.replaceState({}, "", window.location.pathname);
}

await refreshStatus();
