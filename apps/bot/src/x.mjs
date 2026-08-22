const X_API_ROOT = "https://api.x.com";
const CHUNK_BYTES = 4 * 1024 * 1024;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class XError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "XError";
    this.status = status;
  }
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
    if (cleanText.length > this.config.xMaxPostCharacters) {
      throw new XError(`The X post is over ${this.config.xMaxPostCharacters} characters.`, 400);
    }
    if (!await this.connected()) throw new XError("X posting is not connected or enabled.", 503);

    const mediaId = media ? await this.#uploadMedia(media) : null;
    const payload = await this.#json("/2/tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(cleanText ? { text: cleanText } : {}),
        ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
      })
    });
    const id = String(payload?.data?.id || "");
    if (!id) throw new XError("X accepted the request but returned no post ID.");
    return { id, url: `https://x.com/i/web/status/${id}`, text: payload.data.text || cleanText };
  }

  async #uploadMedia({ buffer, mimeType, type }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new XError("The selected media is empty.", 400);
    if (type === "video" || String(mimeType).startsWith("video/")) {
      return this.#uploadVideo(buffer, mimeType || "video/mp4");
    }
    if (!String(mimeType).startsWith("image/")) throw new XError("X only accepts an image or video here.", 400);
    const payload = await this.#json("/2/media/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media: buffer.toString("base64"),
        media_category: "tweet_image",
        media_type: mimeType
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
      const detail = String(payload?.detail || payload?.title || payload?.errors?.[0]?.message || "").slice(0, 240);
      if ([401, 403].includes(response.status)) throw new XError("The X connection needs attention.", 503);
      if (response.status === 429) throw new XError("X posting is rate limited. Try again later.", 429);
      throw new XError(detail || "X could not complete that request.", response.status);
    }
    return payload;
  }
}
