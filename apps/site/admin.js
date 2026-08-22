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

document.querySelector("#admin-logout").addEventListener("click", async () => {
  await api("./api/admin/logout", { method: "POST" });
  telegramToken.value = "";
  showOnly("login");
});

const oauthResult = new URLSearchParams(window.location.search).get("oauth");
if (oauthResult) {
  const messages = {
    connected: "OpenRouter connected to the shared bot.",
    expired: "That connection attempt expired. Please try again.",
    failed: "OpenRouter could not be connected. Please try again."
  };
  adminMessage.textContent = messages[oauthResult] || "";
  window.history.replaceState({}, "", window.location.pathname);
}

await refreshStatus();
