import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  generateStickerSetName,
  normalizeStickerEmoji,
  processForTelegramSticker,
  selectStickerEmoji
} from "../src/stickers.mjs";
import { chooseSticker, isMissingStickerSetError } from "../src/telegram.mjs";

test("sticker processor removes the edge background and meets Telegram limits", async () => {
  const subject = Buffer.from(`
    <svg width="1024" height="768" xmlns="http://www.w3.org/2000/svg">
      <circle cx="512" cy="384" r="230" fill="#fffaf0"/>
      <circle cx="512" cy="384" r="190" fill="#d62828"/>
    </svg>
  `);
  const source = await sharp({
    create: { width: 1024, height: 768, channels: 4, background: "#000000" }
  }).composite([{ input: subject }]).png().toBuffer();

  const result = await processForTelegramSticker(source);
  assert.equal(result.width, 512);
  assert.equal(result.height, 384);
  assert.ok(result.size < 512 * 1024);
  assert.equal(result.mimeType, "image/png");

  const { data, info } = await sharp(result.buffer).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  const centerOffset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
  assert.equal(data[centerOffset + 3], 255);
});

test("sticker helpers make valid pack names and useful emoji choices", () => {
  const name = generateStickerSetName(
    "A very long STOPAI sticker pack name that needs safe trimming and spaces",
    "@StopAiToken_bot"
  );
  assert.match(name, /^[a-z][a-z0-9_]+_by_stopaitoken_bot$/);
  assert.ok(name.length <= 64);
  assert.equal(selectStickerEmoji("angry brake hand"), "✋🏻");
  assert.equal(selectStickerEmoji("laughing at the timeout"), "😂");
  assert.equal(normalizeStickerEmoji("not emoji", "angry"), "😡");
  assert.equal(normalizeStickerEmoji("🔥 extra", "stop"), "🔥");
});

test("sticker selection supports latest, random, emoji, and moods", () => {
  const stickers = [
    { file_id: "stop", emoji: "✋🏻" },
    { file_id: "angry", emoji: "😡" },
    { file_id: "laugh", emoji: "😂" }
  ];
  assert.equal(chooseSticker(stickers, "latest").file_id, "laugh");
  assert.equal(chooseSticker(stickers, "random", () => 0).file_id, "stop");
  assert.equal(chooseSticker(stickers, "😡").file_id, "angry");
  assert.equal(chooseSticker(stickers, "laughing").file_id, "laugh");
  assert.equal(chooseSticker([], "latest"), null);
});

test("missing Telegram sticker packs are recognized without hiding other errors", () => {
  assert.equal(isMissingStickerSetError({ response: { description: "Bad Request: STICKERSET_INVALID" } }), true);
  assert.equal(isMissingStickerSetError(new Error("network offline")), false);
});
