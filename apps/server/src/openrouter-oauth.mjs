import { createHash, randomBytes } from "node:crypto";

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

export function createPkceTransaction() {
  const verifier = randomBytes(48).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(32).toString("base64url")
  };
}

export function buildOpenRouterAuthorizationUrl({ callbackUrl, challenge }) {
  const url = new URL(OPENROUTER_AUTH_URL);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeOpenRouterCode({ code, verifier, fetchImpl = fetch, signal }) {
  if (!code || !verifier) throw new Error("The OAuth callback is incomplete.");

  const response = await fetchImpl(OPENROUTER_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256"
    })
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("OpenRouter returned an unreadable OAuth response.");
  }

  if (!response.ok || typeof payload.key !== "string") {
    throw new Error("OpenRouter did not authorize the connection.");
  }

  return { key: payload.key, userId: payload.user_id || null };
}
