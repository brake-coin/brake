const API_ROOT = "https://openrouter.ai/api/v1";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function dataUrlToMedia(value) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(value || ""));
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

function apiUrl(path) {
  const value = String(path || "");
  const url = value.startsWith("http")
    ? new URL(value)
    : new URL(value.startsWith("/api/v1/") ? value : `/api/v1${value.startsWith("/") ? value : `/${value}`}`, "https://openrouter.ai");
  if (url.origin !== "https://openrouter.ai" || !url.pathname.startsWith("/api/v1/")) {
    throw new Error("Unsafe OpenRouter URL.");
  }
  return url.toString();
}

function costFrom(payload) {
  const value = Number(payload?.usage?.cost);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function textFromContent(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part?.text || "").join("")
    : content;
  return typeof text === "string" ? text.trim().slice(0, 4_000) : "";
}

export class OpenRouterError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

export class OpenRouterClient {
  constructor({ config, credentialProvider, fetchImpl = fetch }) {
    this.config = config;
    this.credentialProvider = credentialProvider;
    this.fetchImpl = fetchImpl;
  }

  async connected() {
    return Boolean(await this.credentialProvider());
  }

  async chat(messages) {
    const result = await this.chatStep(messages);
    if (!result.message.content) {
      throw new OpenRouterError("The shared chat model returned no reply.");
    }
    return { text: result.message.content, costUsd: result.costUsd };
  }

  async chatStep(messages, tools = [], { toolChoice = "auto" } = {}) {
    const body = {
      model: this.config.openRouterChatModel,
      messages,
      max_completion_tokens: 800,
      reasoning: { effort: "minimal", exclude: true },
      temperature: 0.4
    };
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = toolChoice;
    }
    let costUsd = 0;
    let lastPayload = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const payload = await this.#json("/chat/completions", {
        method: "POST",
        body: JSON.stringify(body)
      }, 1_000_000);
      lastPayload = payload;
      costUsd += costFrom(payload);
      const choice = payload?.choices?.[0]?.message;
      const toolCalls = Array.isArray(choice?.tool_calls) ? choice.tool_calls : [];
      const content = textFromContent(choice?.content);
      if (content || toolCalls.length) {
        return {
          message: {
            role: "assistant",
            content: content || null,
            ...(toolCalls.length ? { tool_calls: toolCalls } : {})
          },
          costUsd
        };
      }
    }
    const error = new OpenRouterError("The shared chat model went quiet twice. Try again.");
    error.costUsd = costUsd;
    error.details = {
      model: lastPayload?.model || null,
      finishReason: lastPayload?.choices?.[0]?.finish_reason || null,
      nativeFinishReason: lastPayload?.choices?.[0]?.native_finish_reason || null,
      completionTokens: lastPayload?.usage?.completion_tokens || 0,
      reasoningTokens: lastPayload?.usage?.completion_tokens_details?.reasoning_tokens || 0
    };
    throw error;
  }

  async generateImage({ prompt, referenceDataUrls = [] }) {
    const body = {
      model: this.config.openRouterImageModel,
      prompt,
      n: 1,
      aspect_ratio: "1:1",
      resolution: "1K",
      output_format: "png"
    };
    if (referenceDataUrls.length) {
      body.input_references = referenceDataUrls.slice(0, 2).map((url) => ({
        type: "image_url",
        image_url: { url }
      }));
    }
    const maxJsonBytes = Math.ceil(this.config.maxImageBytes * 1.5) + 1_000_000;
    const payload = await this.#json("/images", {
      method: "POST",
      body: JSON.stringify(body)
    }, maxJsonBytes);
    const image = payload?.data?.[0] || {};
    const dataMedia = dataUrlToMedia(image.url || image.image_url?.url)
      || (image.b64_json
        ? { mimeType: image.mime_type || image.media_type || "image/png", buffer: Buffer.from(image.b64_json, "base64") }
        : null);
    if (dataMedia) {
      if (!dataMedia.mimeType.startsWith("image/") || dataMedia.buffer.length > this.config.maxImageBytes) {
        throw new OpenRouterError("The generated image was too large or had an invalid format.");
      }
      return { ...dataMedia, costUsd: costFrom(payload) };
    }
    const remoteUrl = image.url || image.image_url?.url;
    if (!/^https:\/\//i.test(remoteUrl || "")) {
      throw new OpenRouterError("The shared image model returned no image.");
    }
    return { url: remoteUrl, costUsd: costFrom(payload) };
  }

  async generateVideo({ prompt, referenceDataUrl }) {
    const body = {
      model: this.config.openRouterVideoModel,
      prompt,
      duration: this.config.videoDurationSeconds,
      resolution: this.config.videoResolution,
      aspect_ratio: this.config.videoAspectRatio,
      generate_audio: false
    };
    if (referenceDataUrl) {
      body.frame_images = [{
        type: "image_url",
        image_url: { url: referenceDataUrl },
        frame_type: "first_frame"
      }];
    }
    const submitted = await this.#json("/videos", {
      method: "POST",
      body: JSON.stringify(body)
    }, 1_000_000);
    if (!submitted?.id) throw new OpenRouterError("OpenRouter returned no video job ID.");

    const startedAt = Date.now();
    let status = submitted;
    while (!['completed', 'failed', 'cancelled', 'expired'].includes(status.status)) {
      if (Date.now() - startedAt >= this.config.videoMaxWaitMs) {
        throw new OpenRouterError("The video is still processing. Try again later.", 504);
      }
      await sleep(this.config.videoPollIntervalMs);
      status = await this.#json(
        status.polling_url || `/videos/${encodeURIComponent(submitted.id)}`,
        {},
        1_000_000
      );
    }
    if (status.status !== "completed") {
      throw new OpenRouterError("The shared video model could not make that clip.");
    }

    const downloaded = await this.#request(
      `/videos/${encodeURIComponent(submitted.id)}/content?index=0`,
      {},
      this.config.maxVideoBytes
    );
    if (!downloaded.response.ok) {
      throw new OpenRouterError("OpenRouter could not download the finished video.");
    }
    const mimeType = downloaded.response.headers.get("content-type") || "video/mp4";
    if (!mimeType.startsWith("video/")) {
      throw new OpenRouterError("OpenRouter returned an invalid video format.");
    }
    return {
      buffer: downloaded.buffer,
      mimeType,
      costUsd: costFrom(status) || costFrom(submitted)
    };
  }

  async #json(path, options, maxBytes) {
    const { response, buffer } = await this.#request(path, options, maxBytes);
    let payload = {};
    try {
      payload = JSON.parse(buffer.toString("utf8"));
    } catch {
      if (response.ok) throw new OpenRouterError("OpenRouter returned an unreadable response.");
    }
    if (!response.ok) {
      const upstreamMessage = String(payload?.error?.message || "").slice(0, 300);
      if (response.status === 401 || response.status === 403) {
        throw new OpenRouterError("The shared OpenRouter connection needs attention.", 503);
      }
      if (response.status === 402) {
        throw new OpenRouterError("The shared OpenRouter media budget is empty.", 503);
      }
      if (response.status === 429) {
        throw new OpenRouterError("OpenRouter is busy. Try again soon.", 429);
      }
      throw new OpenRouterError(upstreamMessage || "OpenRouter could not complete that request.");
    }
    return payload;
  }

  async #request(path, options = {}, maxBytes = 1_000_000) {
    const credential = await this.credentialProvider();
    if (!credential?.key) {
      throw new OpenRouterError("The shared OpenRouter account is not connected yet.", 503);
    }
    const response = await this.fetchImpl(apiUrl(path), {
      ...options,
      signal: options.signal || AbortSignal.timeout(this.config.openRouterTimeoutMs),
      headers: {
        Authorization: `Bearer ${credential.key}`,
        "HTTP-Referer": this.config.openRouterSiteUrl,
        "X-OpenRouter-Title": this.config.openRouterAppName,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > maxBytes) {
      throw new OpenRouterError("OpenRouter returned a file that is too large.");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new OpenRouterError("OpenRouter returned a file that is too large.");
    }
    return { response, buffer };
  }
}

export function imageBufferToDataUrl(buffer, mimeType = "image/jpeg") {
  if (!Buffer.isBuffer(buffer)) throw new Error("Reference image is missing.");
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
