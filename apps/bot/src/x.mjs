const X_API_ROOT = "https://api.x.com";
const CHUNK_BYTES = 4 * 1024 * 1024;
const X_URL_LENGTH = 23;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function xPostReference(value) {
  const input = String(value || "").trim();
  if (/^\d{1,19}$/.test(input)) {
    return { id: input, url: `https://x.com/i/web/status/${input}` };
  }
  try {
    const url = new URL(input);
    if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname.toLowerCase())) {
      return null;
    }
    const genericMatch = /^\/i\/web\/status\/(\d{1,19})(?:\/|$)/.exec(url.pathname);
    if (genericMatch) {
      return { id: genericMatch[1], url: `https://x.com/i/web/status/${genericMatch[1]}` };
    }
    const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,19})(?:\/|$)/.exec(url.pathname);
    if (!match) return null;
    return { id: match[2], url: `https://x.com/${match[1]}/status/${match[2]}` };
  } catch {
    return null;
  }
}

export function xWeightedLength(value) {
  const text = String(value || "");
  let length = 0;
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s]+/gi)) {
    length += [...text.slice(cursor, match.index)].length;
    length += X_URL_LENGTH;
    cursor = match.index + match[0].length;
  }
  return length + [...text.slice(cursor)].length;
}

function publicPosts(payload, fallbackUsername = null) {
  const items = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
  const users = new Map((payload?.includes?.users || []).map((user) => [String(user.id), user]));
  const media = new Map((payload?.includes?.media || []).map((item) => [String(item.media_key), item]));
  return items.map((post) => {
    const author = users.get(String(post.author_id)) || {};
    const username = author.username || fallbackUsername;
    return {
      id: String(post.id),
      text: String(post.text || "").slice(0, 1_000),
      createdAt: post.created_at || null,
      url: username
        ? `https://x.com/${username}/status/${post.id}`
        : `https://x.com/i/web/status/${post.id}`,
      author: {
        id: post.author_id ? String(post.author_id) : null,
        username: username || null,
        name: author.name || null
      },
      metrics: post.public_metrics || null,
      media: (post.attachments?.media_keys || []).map((key) => media.get(String(key))).filter(Boolean)
        .map((item) => ({
          type: item.type,
          url: item.url || item.preview_image_url || null,
          altText: item.alt_text || null
        }))
    };
  });
}

export function resolveMediaMimeType({ buffer, mimeType, type }) {
  const reported = String(mimeType || "").split(";", 1)[0].trim().toLowerCase();
  if (reported.startsWith("image/") || reported.startsWith("video/")) return reported;
  if (Buffer.isBuffer(buffer)) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return "image/png";
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
      return "image/gif";
    }
    if (buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
      return "image/webp";
    }
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
      return "video/mp4";
    }
  }
  if (type === "image") return "image/jpeg";
  if (type === "video") return "video/mp4";
  return "";
}

export class XError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "XError";
    this.status = status;
  }
}

export function validateXPostReceipt(post, { id, expectedUsername = "" } = {}) {
  const postId = String(id || "");
  const authorUsername = String(post?.author?.username || "").replace(/^@/, "");
  const requiredUsername = String(expectedUsername || "").replace(/^@/, "");
  const reference = xPostReference(post?.url);
  const expectedUrl = authorUsername && postId
    ? `https://x.com/${authorUsername}/status/${postId}`
    : "";
  if (!postId
    || String(post?.id || "") !== postId
    || !reference
    || reference.id !== postId
    || post.url !== expectedUrl
    || (requiredUsername && authorUsername.toLowerCase() !== requiredUsername.toLowerCase())) {
    const error = new XError("X returned a post receipt for an unexpected URL or account.", 502);
    error.postId = postId;
    error.candidateUrl = post?.url || "";
    error.unexpectedReceipt = true;
    throw error;
  }
  return post;
}

export class XClient {
  constructor({ config, credentialProvider, fetchImpl = fetch }) {
    this.config = config;
    this.credentialProvider = credentialProvider;
    this.fetchImpl = fetchImpl;
  }

  async connected() {
    const credential = await this.credentialProvider();
    return Boolean(this.config.xPostingEnabled && credential?.accessToken);
  }

  async post({ text, media = null }) {
    const cleanText = String(text || "").trim();
    if (!cleanText && !media) throw new XError("An X post needs text or media.", 400);
    if (xWeightedLength(cleanText) > this.config.xMaxPostCharacters) {
      throw new XError(`The X post is over ${this.config.xMaxPostCharacters} characters.`, 400);
    }
    if (!await this.connected()) throw new XError("X posting is not connected or enabled.", 503);

    const mediaId = media ? await this.#uploadMedia(media) : null;
    const payload = await this.#json("/2/tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        made_with_ai: true,
        ...(cleanText ? { text: cleanText } : {}),
        ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
      })
    });
    const id = String(payload?.data?.id || "");
    if (!id) throw new XError("X accepted the request but returned no post ID.");
    const verifiedPost = await this.#verifyCreatedPost(id);
    return {
      id,
      url: verifiedPost.url,
      text: verifiedPost.text || payload.data.text || cleanText,
      verified: true,
      verifiedAt: new Date().toISOString(),
      author: verifiedPost.author
    };
  }

  async readPost(value) {
    const reference = xPostReference(value);
    if (!reference) throw new XError("Use a valid X post URL or numeric post ID.", 400);
    const query = new URLSearchParams({
      "tweet.fields": "author_id,created_at,public_metrics,attachments,referenced_tweets",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "username,name,verified",
      "media.fields": "type,url,preview_image_url,alt_text"
    });
    const payload = await this.#json(`/2/tweets/${reference.id}?${query}`);
    const post = publicPosts(payload)[0];
    if (!post) throw new XError("X returned no matching post.", 404);
    return post;
  }

  async searchRecent(searchQuery, limit = 5) {
    const value = String(searchQuery || "").trim();
    if (!value || value.length > 512) throw new XError("The X search must be between 1 and 512 characters.", 400);
    const requested = Math.max(1, Math.min(10, Number(limit) || 5));
    const query = new URLSearchParams({
      query: value,
      max_results: "10",
      "tweet.fields": "author_id,created_at,public_metrics,attachments,referenced_tweets",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "username,name,verified",
      "media.fields": "type,url,preview_image_url,alt_text"
    });
    const payload = await this.#json(`/2/tweets/search/recent?${query}`);
    return publicPosts(payload).slice(0, requested);
  }

  async userPosts(username, limit = 5) {
    const handle = String(username || "").trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new XError("Use a valid X username.", 400);
    const userQuery = new URLSearchParams({ "user.fields": "username,name,description,public_metrics" });
    const userPayload = await this.#json(`/2/users/by/username/${encodeURIComponent(handle)}?${userQuery}`);
    const user = userPayload?.data;
    if (!user?.id) throw new XError(`X could not find @${handle}.`, 404);
    const requested = Math.max(1, Math.min(10, Number(limit) || 5));
    const query = new URLSearchParams({
      max_results: String(Math.max(5, requested)),
      exclude: "retweets,replies",
      "tweet.fields": "author_id,created_at,public_metrics,attachments,referenced_tweets",
      expansions: "attachments.media_keys",
      "media.fields": "type,url,preview_image_url,alt_text"
    });
    const payload = await this.#json(`/2/users/${encodeURIComponent(user.id)}/tweets?${query}`);
    return {
      user: {
        id: String(user.id),
        username: user.username || handle,
        name: user.name || null,
        description: user.description || null,
        metrics: user.public_metrics || null
      },
      posts: publicPosts(payload, user.username || handle).slice(0, requested)
    };
  }

  async #verifyCreatedPost(id) {
    const attempts = Math.max(1, Math.min(5, Number(this.config.xPostVerifyAttempts) || 3));
    const configuredDelay = Number(this.config.xPostVerifyDelayMs);
    const delayMs = Number.isFinite(configuredDelay)
      ? Math.max(0, Math.min(5_000, configuredDelay))
      : 750;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const post = await this.readPost(id);
        if (post?.id === String(id)) {
          return validateXPostReceipt(post, {
            id,
            expectedUsername: this.config.xExpectedUsername
          });
        }
      } catch (error) {
        if (error?.unexpectedReceipt) throw error;
        lastError = error;
        if (error instanceof XError && error.status === 503) throw error;
      }
      if (attempt + 1 < attempts && delayMs) await sleep(delayMs);
    }
    const error = new XError(
      "X returned a post ID, but the post could not be verified. Nothing was confirmed as published.",
      502
    );
    error.postId = String(id);
    error.candidateUrl = `https://x.com/i/web/status/${id}`;
    error.cause = lastError;
    throw error;
  }

  async #uploadMedia({ buffer, mimeType, type }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new XError("The selected media is empty.", 400);
    const resolvedMimeType = resolveMediaMimeType({ buffer, mimeType, type });
    if (type === "video" || resolvedMimeType.startsWith("video/")) {
      return this.#uploadVideo(buffer, resolvedMimeType);
    }
    if (!resolvedMimeType.startsWith("image/")) throw new XError("X only accepts an image or video here.", 400);
    const payload = await this.#json("/2/media/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media: buffer.toString("base64"),
        media_category: "tweet_image",
        media_type: resolvedMimeType
      })
    });
    return this.#mediaId(payload);
  }

  async #uploadVideo(buffer, mimeType) {
    const initialized = await this.#form("/2/media/upload", {
      command: "INIT",
      media_type: mimeType,
      total_bytes: String(buffer.length),
      media_category: "tweet_video"
    });
    const mediaId = this.#mediaId(initialized);

    let segmentIndex = 0;
    for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
      await this.#form("/2/media/upload", {
        command: "APPEND",
        media_id: mediaId,
        segment_index: String(segmentIndex),
        media: new Blob([buffer.subarray(offset, offset + CHUNK_BYTES)], { type: mimeType })
      }, false);
      segmentIndex += 1;
    }

    let status = await this.#form("/2/media/upload", {
      command: "FINALIZE",
      media_id: mediaId
    });
    const startedAt = Date.now();
    while (["pending", "in_progress"].includes(status?.data?.processing_info?.state)) {
      if (Date.now() - startedAt >= this.config.xTimeoutMs) {
        throw new XError("X is still processing the video. Try again later.", 504);
      }
      const waitSeconds = Math.max(1, Number(status.data.processing_info.check_after_secs) || 1);
      await sleep(Math.min(waitSeconds, 10) * 1_000);
      status = await this.#json(`/2/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`);
    }
    if (status?.data?.processing_info?.state === "failed") {
      throw new XError("X could not process that video.");
    }
    return mediaId;
  }

  #mediaId(payload) {
    const id = String(payload?.data?.id || payload?.media_id_string || payload?.media_id || "");
    if (!id) throw new XError("X returned no media ID.");
    return id;
  }

  async #form(path, fields, expectJson = true) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (value instanceof Blob) form.append(name, value, "media");
      else form.append(name, value);
    }
    return this.#json(path, { method: "POST", body: form }, expectJson);
  }

  async #json(path, options = {}, expectJson = true) {
    const credential = await this.credentialProvider();
    if (!credential?.accessToken) throw new XError("X is not connected.", 503);
    const response = await this.fetchImpl(`${X_API_ROOT}${path}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(this.config.xTimeoutMs),
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        ...options.headers
      }
    });
    const body = await response.text();
    let payload = {};
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        if (response.ok && expectJson) throw new XError("X returned an unreadable response.");
      }
    }
    if (!response.ok) {
      const detail = String(
        payload?.detail
        || payload?.title
        || payload?.errors?.[0]?.detail
        || payload?.errors?.[0]?.message
        || ""
      ).slice(0, 240);
      if ([401, 403].includes(response.status)) throw new XError("The X connection needs attention.", 503);
      if (response.status === 429) throw new XError("X is rate limited. Try again later.", 429);
      throw new XError(detail || "X could not complete that request.", response.status);
    }
    return payload;
  }
}
