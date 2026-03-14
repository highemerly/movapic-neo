/**
 * フォントプレビュー画像を生成するスクリプト
 *
 * Usage: node scripts/generate-font-previews.js
 */

/* eslint-disable @typescript-eslint/no-require-imports, react-hooks/rules-of-hooks */
const { Canvas, FontLibrary } = require("skia-canvas");
const fs = require("fs");
const path = require("path");

const WIDTH = 200;
const HEIGHT = 50;

const fonts = [
  { id: "hui-font", file: "HuiFont29.ttf", text: "ふい字" },
  { id: "noto-sans-jp", file: "NotoSansJP-Regular.ttf", text: "Noto Sans JP" },
  { id: "light-novel-pop", file: "LightNovelPOPv2.otf", text: "ラノベPOP" },
];

async function generateFontPreview(font) {
  // フォントを読み込み
  const fontPath = path.join(__dirname, "../fonts", font.file);
  FontLibrary.use(font.id, fontPath);

  const canvas = new Canvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // 背景（透過）
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const fontSize = 24;
  ctx.font = `${fontSize}px "${font.id}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = WIDTH / 2;
  const y = HEIGHT / 2;

  // 文字を描画（黒）
  ctx.fillStyle = "#000000";
  ctx.fillText(font.text, x, y);

  const buffer = await canvas.toBuffer("png");
  const outputPath = path.join(__dirname, "../public/fonts", `${font.id}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log("Created:", outputPath);
}

async function main() {
  for (const font of fonts) {
    await generateFontPreview(font);
  }
  console.log("Done!");
}

main().catch(console.error);
