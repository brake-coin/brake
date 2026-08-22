const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.1-flash-image";
const STYLES = new Set(["reaction", "poster", "surreal", "news"]);

export class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserInputError";
  }
}

export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

export function validateMemeRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new UserInputError("Send a meme idea and style.");
  }

  const idea = typeof body.idea === "string" ? body.idea.trim().replaceAll(/\s+/g, " ") : "";
  const style = typeof body.style === "string" ? body.style : "reaction";

  if (idea.length < 3) throw new UserInputError("Give the meme a little more detail.");
  if (idea.length > 280) throw new UserInputError("Keep the meme idea under 280 characters.");
  if (!STYLES.has(style)) throw new UserInputError("Choose a supported meme style.");

  return { idea, style };
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

function extractGeneratedImage(payload) {
  const image = payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    throw new UpstreamError("The image model replied without an image. Try a different idea.");
  }
  return image;
}

export async function generateMeme({
  idea,
  style,
  referenceImage,
  apiKey,
  model = DEFAULT_MODEL,
  siteUrl,
  appName = "STOPAI Meme Generator",
  fetchImpl = fetch,
  signal
}) {
  if (!apiKey) throw new UpstreamError("The meme generator has not been configured.", 503);
  if (!referenceImage?.startsWith("data:image/")) {
    throw new UpstreamError("The STOPAI reference image is unavailable.", 500);
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  if (appName) headers["X-Title"] = appName;

  const response = await fetchImpl(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildMemePrompt({ idea, style }) },
            { type: "image_url", image_url: { url: referenceImage } }
          ]
        }
      ],
      image_config: { aspect_ratio: "1:1" }
    })
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new UpstreamError("The image service returned an unreadable response.");
  }

  if (!response.ok) {
    const detail = payload?.error?.message;
    throw new UpstreamError(
      detail ? `Image service error: ${detail}` : "The image service is unavailable. Try again shortly."
    );
  }

  return {
    image: extractGeneratedImage(payload),
    model,
    caption: payload?.choices?.[0]?.message?.content || null
  };
}

export class FixedWindowRateLimiter {
  #buckets = new Map();

  constructor({ limit = 3, windowMs = 600_000, now = Date.now } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  take(key) {
    const currentTime = this.now();
    const current = this.#buckets.get(key);
    const bucket = !current || current.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + this.windowMs }
      : current;

    bucket.count += 1;
    this.#buckets.set(key, bucket);

    return {
      allowed: bucket.count <= this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))
    };
  }
}
