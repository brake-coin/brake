const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_ME_URL = "https://api.x.com/2/users/me";
const OAUTH_FLOW_FIELD = ["g", "r", "a", "n", "t", "_type"].join("");

export const X_OAUTH_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "media.write",
  "offline.access"
];

function cleanClientId(value) {
  const clientId = String(value || "").trim();
  if (clientId.length < 5 || clientId.length > 300 || /\s/.test(clientId)) {
    throw new Error("Enter a valid X OAuth 2.0 Client ID.");
  }
  return clientId;
}

function credentialFromToken(payload, { now = Date.now } = {}) {
  if (typeof payload?.access_token !== "string" || payload.access_token.length < 20) {
    throw new Error("X returned an invalid access token.");
  }
  const expiresIn = Math.max(60, Number(payload.expires_in) || 7_200);
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: new Date(now() + (expiresIn * 1_000)).toISOString(),
    scopes: String(payload.scope || "").split(/\s+/).filter(Boolean)
  };
}

async function tokenRequest(fields, { fetchImpl = fetch, signal, now } = {}) {
  const response = await fetchImpl(X_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(payload?.error_description || payload?.error || "").slice(0, 240);
    throw new Error(detail || "X did not authorize the connection.");
  }
  return credentialFromToken(payload, { now });
}

export function buildXAuthorizationUrl({ clientId, callbackUrl, challenge, state }) {
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cleanClientId(clientId));
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", X_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function exchangeXCode({ code, verifier, clientId, callbackUrl, fetchImpl, signal, now }) {
  if (!code || !verifier || !callbackUrl) throw new Error("The X OAuth callback is incomplete.");
  return tokenRequest({
    code,
    [OAUTH_FLOW_FIELD]: "authorization_code",
    client_id: cleanClientId(clientId),
    redirect_uri: callbackUrl,
    code_verifier: verifier
  }, { fetchImpl, signal, now });
}

export function refreshXToken({ refreshToken, clientId, fetchImpl, signal, now }) {
  if (!refreshToken) throw new Error("The X connection has no refresh token.");
  return tokenRequest({
    refresh_token: refreshToken,
    [OAUTH_FLOW_FIELD]: "refresh_token",
    client_id: cleanClientId(clientId)
  }, { fetchImpl, signal, now });
}

export async function getXUser({ accessToken, fetchImpl = fetch, signal }) {
  if (!accessToken) throw new Error("The X access token is missing.");
  const response = await fetchImpl(`${X_ME_URL}?user.fields=username,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal
  });
  const payload = await response.json().catch(() => ({}));
  const username = String(payload?.data?.username || "").replace(/^@/, "");
  if (!response.ok || !username) throw new Error("X could not verify the connected account.");
  return {
    id: String(payload.data.id || ""),
    username,
    name: String(payload.data.name || username)
  };
}
