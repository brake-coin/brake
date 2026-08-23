const DEFAULT_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_STALE_MS = 6 * 60 * 60 * 1_000;
const MEDIA_HOSTS = new Set(["pbs.twimg.com", "video.twimg.com"]);

function safeMediaUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && MEDIA_HOSTS.has(url.hostname.toLowerCase())
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function galleryPosts(posts, limit = 9) {
  return (posts || []).flatMap((post) => {
    const media = (post.media || []).map((item) => ({
      type: item.type === "video" || item.type === "animated_gif" ? "video" : "image",
      previewUrl: safeMediaUrl(item.url),
      altText: String(item.altText || "").slice(0, 1_000)
    })).filter((item) => item.previewUrl);
    if (!media.length || !/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{1,19}$/.test(post.url || "")) {
      return [];
    }
    return [{
      id: String(post.id),
      url: post.url,
      text: String(post.text || "").slice(0, 1_000),
      createdAt: post.createdAt || null,
      media
    }];
  }).slice(0, Math.max(1, Math.min(12, Number(limit) || 9)));
}

export class XGallery {
  constructor({ xClient, username = "STOPAICOIN", ttlMs = DEFAULT_TTL_MS, staleMs = DEFAULT_STALE_MS }) {
    this.xClient = xClient;
    this.username = username;
    this.ttlMs = ttlMs;
    this.staleMs = staleMs;
    this.cache = null;
    this.pending = null;
  }

  async read() {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAtMs < this.ttlMs) {
      return { ...this.cache.value, cached: true };
    }
    if (!this.pending) {
      this.pending = this.#refresh().finally(() => {
        this.pending = null;
      });
    }
    try {
      return await this.pending;
    } catch (error) {
      if (this.cache && now - this.cache.fetchedAtMs < this.staleMs) {
        return { ...this.cache.value, cached: true, stale: true };
      }
      throw error;
    }
  }

  async #refresh() {
    const result = await this.xClient.userPosts(this.username, 10);
    const value = {
      account: `@${result.user.username || this.username}`,
      profileUrl: `https://x.com/${result.user.username || this.username}`,
      posts: galleryPosts(result.posts),
      fetchedAt: new Date().toISOString(),
      cached: false,
      stale: false
    };
    this.cache = { value, fetchedAtMs: Date.now() };
    return value;
  }
}
