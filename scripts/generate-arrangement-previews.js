/**
 * アレンジプレビュー画像を生成するスクリプト
 *
 * Usage: node scripts/generate-arrangement-previews.js
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { Canvas } = require("skia-canvas");
const fs = require("fs");
const path = require("path");

const WIDTH = 200;
const HEIGHT = 50;

// ネオン効果のプレビュー画像を生成
async function generateNeonPreview() {
  const canvas = new Canvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // 背景（透過）
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const text = "ネオン";
  const fontSize = 28;
  ctx.font = `${fontSize}px "Noto Sans JP"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = WIDTH / 2;
  const y = HEIGHT / 2;

  // 外側グロー（シアン系で視認性を確保）
  ctx.shadowColor = "#00bfff";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#00bfff";
  ctx.fillText(text, x, y);

  // 中間グロー
  ctx.shadowBlur = 6;
  ctx.fillText(text, x, y);

  // 中心（白く光る芯）
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);

  const buffer = await canvas.toBuffer("png");
  const outputPath = path.join(__dirname, "../public/arrangements/neon.png");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log("Created:", outputPath);
}

// ハンコ効果のプレビュー画像を生成
async function generateStampPreview() {
  const canvas = new Canvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // 背景（透過）
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const text = "ハンコ";
  const fontSize = 26;
  ctx.font = `${fontSize}px "Noto Sans JP"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = WIDTH / 2;
  const y = HEIGHT / 2;

  // 枠線（傾きなし）
  const textMetrics = ctx.measureText(text);
  const padding = 6;
  const boxWidth = textMetrics.width + padding * 2;
  const boxHeight = fontSize + padding * 2;

  ctx.strokeStyle = "#c41e3a";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);

  // 文字（朱肉色、少しかすれ感）
  ctx.fillStyle = "#c41e3a";
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, x, y);

  const buffer = await canvas.toBuffer("png");
  const outputPath = path.join(__dirname, "../public/arrangements/stamp.png");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log("Created:", outputPath);
}

async function main() {
  await generateNeonPreview();
  await generateStampPreview();
  console.log("Done!");
}

main().catch(console.error);
