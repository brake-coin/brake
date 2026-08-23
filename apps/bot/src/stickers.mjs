import sharp from "sharp";

// Adapted from the SolanaFirehorse sticker processor and Swarm's
// @swarm/sticker-engine package. Keep this module free of storage and Telegram
// calls so every bot can reuse the image pipeline.
const TELEGRAM_STICKER_SIZE = 512;
const TELEGRAM_MAX_BYTES = 512 * 1024;

function chroma(red, green, blue) {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

function luma(red, green, blue) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function isGrayish(red, green, blue, tolerance = 25) {
  return Math.abs(red - green) <= tolerance
    && Math.abs(green - blue) <= tolerance
    && Math.abs(red - blue) <= tolerance;
}

async function removeEdgeBackground(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixelCount = width * height;
  const pixels = new Uint8Array(data);
  const output = Buffer.from(data);

  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 100));
  for (let x = 0; x < width; x += step) {
    samples.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += step) {
    samples.push(y * width, y * width + width - 1);
  }

  let averageRed = 0;
  let averageGreen = 0;
  let averageBlue = 0;
  for (const key of samples) {
    const offset = key * channels;
    averageRed += pixels[offset];
    averageGreen += pixels[offset + 1];
    averageBlue += pixels[offset + 2];
  }
  averageRed /= samples.length;
  averageGreen /= samples.length;
  averageBlue /= samples.length;

  let edgeVariance = 0;
  for (const key of samples) {
    const offset = key * channels;
    edgeVariance += (pixels[offset] - averageRed) ** 2
      + (pixels[offset + 1] - averageGreen) ** 2
      + (pixels[offset + 2] - averageBlue) ** 2;
  }
  edgeVariance /= samples.length;
  const hasUniformEdge = edgeVariance < 800;

  const colored = new Uint8Array(pixelCount);
  for (let key = 0; key < pixelCount; key += 1) {
    const offset = key * channels;
    if (chroma(pixels[offset], pixels[offset + 1], pixels[offset + 2]) >= 22) {
      colored[key] = 1;
    }
  }

  function isNextToColor(x, y) {
    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) continue;
        const nextX = x + deltaX;
        const nextY = y + deltaY;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        if (colored[nextY * width + nextX]) return true;
      }
    }
    return false;
  }

  function isBackground(offset) {
    if (pixels[offset + 3] === 0) return true;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const pixelLuma = luma(red, green, blue);
    const pixelChroma = chroma(red, green, blue);
    if (pixelLuma >= 180 || pixelChroma >= 22) return false;
    if (pixelLuma <= 45 && pixelChroma <= 20) return true;
    if (isGrayish(red, green, blue) && pixelChroma <= 20) return true;
    if (!hasUniformEdge) return false;
    return Math.abs(red - averageRed)
      + Math.abs(green - averageGreen)
      + Math.abs(blue - averageBlue) < 60;
  }

  const queued = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueLength = 0;
  let queueIndex = 0;
  function enqueue(key) {
    if (queued[key]) return;
    queued[key] = 1;
    queue[queueLength] = key;
    queueLength += 1;
  }
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (queueIndex < queueLength) {
    const key = queue[queueIndex];
    queueIndex += 1;
    const offset = key * channels;
    if (!isBackground(offset)) continue;
    const x = key % width;
    const y = Math.floor(key / width);
    if (pixels[offset + 3] !== 0 && isNextToColor(x, y)) continue;
    output[offset + 3] = 0;
    if (x > 0) enqueue(key - 1);
    if (x + 1 < width) enqueue(key + 1);
    if (y > 0) enqueue(key - width);
    if (y + 1 < height) enqueue(key + width);
  }

  return sharp(output, { raw: { width, height, channels } }).png().toBuffer();
}

export function generateStickerSetName(baseName, botUsername) {
  const cleanUsername = String(botUsername || "bot")
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const suffix = `_by_${cleanUsername || "bot"}`;
  const maximumBaseLength = Math.max(1, 64 - suffix.length);
  let cleanBase = String(baseName || "stickers")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(cleanBase)) cleanBase = `s_${cleanBase}`;
  cleanBase = cleanBase.slice(0, maximumBaseLength).replace(/_+$/g, "");
  return `${cleanBase || "stickers"}${suffix}`;
}

export function selectStickerEmoji(prompt = "") {
  const value = String(prompt).toLowerCase();
  if (/stop|brake|pause|hand/.test(value)) return "✋🏻";
  if (/angry|rage|mad/.test(value)) return "😡";
  if (/fire|burn/.test(value)) return "🔥";
  if (/laugh|lol|funny/.test(value)) return "😂";
  if (/happy|joy|smile/.test(value)) return "😄";
  if (/sad|cry/.test(value)) return "😢";
  if (/scared|fear/.test(value)) return "😰";
  if (/love|heart/.test(value)) return "❤️";
  if (/win|victory|champion/.test(value)) return "🏆";
  return "✋🏻";
}

export function normalizeStickerEmoji(value, prompt = "") {
  const fallback = selectStickerEmoji(prompt);
  const segment = [...new Intl.Segmenter("en", { granularity: "grapheme" })
    .segment(String(value || "").trim())][0]?.segment;
  return segment && /\p{Extended_Pictographic}/u.test(segment) ? segment : fallback;
}

export async function processForTelegramSticker(imageBuffer, { removeBackground = true } = {}) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("A sticker source image is required.");
  }
  const workingBuffer = removeBackground
    ? await removeEdgeBackground(imageBuffer)
    : imageBuffer;
  const metadata = await sharp(workingBuffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("The sticker image has no dimensions.");
  const resize = metadata.width >= metadata.height
    ? { width: TELEGRAM_STICKER_SIZE }
    : { height: TELEGRAM_STICKER_SIZE };
  let buffer = await sharp(workingBuffer)
    .ensureAlpha()
    .resize({ ...resize, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  for (const colours of [256, 128, 64]) {
    if (buffer.length <= TELEGRAM_MAX_BYTES) break;
    buffer = await sharp(workingBuffer)
      .ensureAlpha()
      .resize({ ...resize, fit: "inside", withoutEnlargement: false })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, colours })
      .toBuffer();
  }

  const output = await sharp(buffer).metadata();
  const width = output.width || 0;
  const height = output.height || 0;
  if (width > TELEGRAM_STICKER_SIZE || height > TELEGRAM_STICKER_SIZE) {
    throw new Error(`Telegram sticker dimensions are too large: ${width}x${height}.`);
  }
  if (width !== TELEGRAM_STICKER_SIZE && height !== TELEGRAM_STICKER_SIZE) {
    throw new Error(`A Telegram sticker needs one 512px side: ${width}x${height}.`);
  }
  if (buffer.length > TELEGRAM_MAX_BYTES) {
    throw new Error(`Telegram sticker is larger than 512KB: ${buffer.length} bytes.`);
  }
  return { buffer, width, height, size: buffer.length, mimeType: "image/png" };
}
