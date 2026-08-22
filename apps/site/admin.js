const loadingPanel = document.querySelector("#admin-loading");
const loginPanel = document.querySelector("#admin-login");
const unconfiguredPanel = document.querySelector("#admin-unconfigured");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password");
const loginMessage = document.querySelector("#login-message");
const adminMessage = document.querySelector("#admin-message");
const connectionTitle = document.querySelector("#connection-title");
const connectionDot = document.querySelector("#connection-dot");
const connectionDetails = document.querySelector("#connection-details");
const connectionCopy = document.querySelector("#connection-copy");
const keyFingerprint = document.querySelector("#key-fingerprint");
const linkedAt = document.querySelector("#linked-at");
const openRouterUser = document.querySelector("#openrouter-user");
const settingsLink = document.querySelector("#key-settings-link");
const activityLink = document.querySelector("#key-activity-link");
const connectButton = document.querySelector("#connect-openrouter");
const disconnectButton = document.querySelector("#disconnect-openrouter");
const logoutButton = document.querySelector("#admin-logout");

function showOnly(panel) {
  for (const candidate of [loadingPanel, loginPanel, unconfiguredPanel, dashboard]) {
    candidate.hidden = candidate !== panel;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Empty or non-JSON responses are handled by the status check below.
  }
  if (!response.ok) {
    const error = new Error(payload.error || "The admin service did not respond.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function renderConnection(status) {
  showOnly(dashboard);
  connectionDetails.hidden = !status.connected;
  disconnectButton.hidden = !status.connected;
  connectionDot.dataset.connected = status.connected ? "true" : "false";
  connectionTitle.textContent = status.connected ? "Connected" : "Not connected";
  connectButton.textContent = status.connected ? "Reconnect OpenRouter" : "Connect OpenRouter";
  connectionCopy.textContent = status.connected
    ? "Public meme generation is online. Reconnect to rotate or replace the key."
    : "Connect your OpenRouter account to switch on public meme generation.";

  if (status.connected) {
    keyFingerprint.textContent = `${status.keyFingerprint}…`;
    linkedAt.textContent = new Date(status.linkedAt).toLocaleString();
    openRouterUser.textContent = status.userId || "Not supplied";
    settingsLink.href = status.settingsUrl;
    activityLink.href = status.activityUrl;
  }
}

async function refreshStatus() {
  try {
    renderConnection(await api("./api/admin/status"));
  } catch (error) {
    if (error.status === 401) showOnly(loginPanel);
    else if (error.status === 503) showOnly(unconfiguredPanel);
    else {
      showOnly(loginPanel);
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
  if (!window.confirm("Disconnect this site from its OpenRouter key?")) return;
  adminMessage.textContent = "Disconnecting…";
  try {
    await api("./api/admin/openrouter/disconnect", { method: "POST" });
    adminMessage.textContent = "OpenRouter disconnected.";
    await refreshStatus();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

logoutButton.addEventListener("click", async () => {
  await api("./api/admin/logout", { method: "POST" });
  showOnly(loginPanel);
});

const oauthResult = new URLSearchParams(window.location.search).get("oauth");
if (oauthResult) {
  const messages = {
    connected: "OpenRouter connected. The meme machine is online.",
    expired: "That connection attempt expired. Please try again.",
    failed: "OpenRouter could not be connected. Please try again."
  };
  adminMessage.textContent = messages[oauthResult] || "";
  window.history.replaceState({}, "", window.location.pathname);
}

await refreshStatus();
