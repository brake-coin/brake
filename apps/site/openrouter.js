import { normalizeMemeIdea } from "./meme-ideas.js?v=20260823-3";

export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";
export const DEFAULT_IDEA_MODEL = "~google/gemini-flash-latest";

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const STYLES = new Set(["reaction", "poster", "surreal", "news"]);

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value, cryptoImpl = globalThis.crypto) {
  return new Uint8Array(
    await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(value))
  );
}

export async function createPkceTransaction(cryptoImpl = globalThis.crypto) {
  const verifierBytes = new Uint8Array(48);
  const stateBytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(verifierBytes);
  cryptoImpl.getRandomValues(stateBytes);
  const verifier = bytesToBase64Url(verifierBytes);

  return {
    verifier,
    challenge: bytesToBase64Url(await sha256(verifier, cryptoImpl)),
    state: bytesToBase64Url(stateBytes),
    createdAt: Date.now()
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.key !== "string") {
    throw new Error(payload?.error?.message || "OpenRouter did not authorize this connection.");
  }
  return { key: payload.key, userId: payload.user_id || null };
}

export async function keyLinks(key, cryptoImpl = globalThis.crypto) {
  const digest = await sha256(key, cryptoImpl);
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    activityUrl: `https://openrouter.ai/logs?api_key_hash=${hash}`,
    settingsUrl: `https://openrouter.ai/keys/${hash}`
  };
}

export async function generateMemeIdea({
  apiKey,
  model = DEFAULT_IDEA_MODEL,
  fetchImpl = fetch,
  signal
}) {
  if (!apiKey) throw new Error("Connect OpenRouter first.");
  const response = await fetchImpl(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "STOPAI Meme Idea Machine"
    },
    signal,
    body: JSON.stringify({
      model,
      temperature: 1.15,
      max_tokens: 220,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "stopai_meme_idea",
          strict: true,
          schema: {
            type: "object",
            properties: {
              style: { type: "string", description: "A weird visual treatment, under 10 words." },
              theme: { type: "string", description: "One funny visual scene about slowing the uncontrolled AI race." },
              message: { type: "string", description: "A short, sharp takeaway, under 10 words." },
              memeStyle: { type: "string", enum: ["reaction", "poster", "surreal", "news"] }
            },
            required: ["style", "theme", "message", "memeStyle"],
            additionalProperties: false
          }
        }
      },
      messages: [
        {
          role: "system",
          content: "You invent original, strange but clear STOPAI meme concepts. Be funny, peaceful, lawful, and critical of the uncontrolled AI race. Avoid factual claims, real-person attacks, threats, financial hype, token promotion, and copied meme captions. Make the visual scene concrete and put the odd STOPAI hand somewhere useful. Return only the requested JSON."
        },
        {
          role: "user",
          content: "Roll one surprising meme from three parts: visual style, visual theme, and core message. Avoid generic robots-taking-over jokes."
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenRouter could not roll a meme idea.");
  }
  const content = payload?.choices?.[0]?.message?.content;
  const rawContent = Array.isArray(content)
    ? content.map((part) => part?.text || "").join("")
    : content;
  let parsed;
  try {
    parsed = typeof rawContent === "string"
      ? JSON.parse(rawContent.replace(/^```(?:json)?\s*|\s*```$/gi, ""))
      : rawContent;
  } catch {
    throw new Error("The idea model returned an unreadable roll.");
  }
  return { ...normalizeMemeIdea(parsed), model };
}

export function validateMemeRequest({ idea, style }) {
  const cleanIdea = typeof idea === "string" ? idea.trim().replaceAll(/\s+/g, " ") : "";
  if (cleanIdea.length < 3) throw new Error("Give the meme a little more detail.");
  if (cleanIdea.length > 280) throw new Error("Keep the meme idea under 280 characters.");
  if (!STYLES.has(style)) throw new Error("Choose a supported meme style.");
  return { idea: cleanIdea, style };
}

export function buildMemePrompt({ idea, style }) {
  const styleDirections = {
    reaction: "a punchy internet reaction meme with one bold visual joke",
    poster: "a rough screen-printed protest poster with striking typography",
    surreal: "an absurdist, slightly chaotic surreal meme",
    news: "a deadpan breaking-news parody graphic"
  };

  return `Create a square STOPAI campaign meme based on this exact idea: "${idea}"

Style: ${styleDirections[style]}.

Use the attached STOPAI emblem as the visual anchor. Preserve its distinctive imperfect open hand, including the weird small thumb/finger shape on the left; that odd hand is intentional and is part of the joke. Keep the red stop-sign octagon, cream hand, and heavy black outline recognizable. You may remix the setting and composition, but do not replace the hand with a polished generic icon.

Make it legible on a phone, visually funny, and suitable for a social post. The campaign lockup is "$STOPAI ✋🏻😡"; include it only if it strengthens the joke. Use very little text and spell every word correctly. Do not invent a token address, price, return, endorsement, partnership, news event, or factual claim. Do not depict or encourage violence, threats, property damage, or harassment. Peaceful criticism and satire of the AI race are welcome.`;
}

export async function generateMeme({
  idea,
  style,
  referenceImage,
  apiKey,
  model = DEFAULT_IMAGE_MODEL,
  fetchImpl = fetch,
  signal
}) {
  if (!apiKey) throw new Error("Connect OpenRouter first.");
  if (!referenceImage?.startsWith("data:image/")) {
    throw new Error("The STOPAI reference image is unavailable.");
  }

  const request = validateMemeRequest({ idea, style });
  const response = await fetchImpl(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "STOPAI Meme Generator"
    },
    signal,
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildMemePrompt(request) },
            { type: "image_url", image_url: { url: referenceImage } }
          ]
        }
      ],
      image_config: { aspect_ratio: "1:1" }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenRouter could not generate this meme.");
  }
  const image = payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    throw new Error("The model returned no image. Try a different idea.");
  }
  return { image, model };
}
