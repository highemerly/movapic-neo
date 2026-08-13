/**
 * アレンジ選択（OptionsPanel のセグメントコントロール）に出すプレビュー画像を生成する。
 *
 * Usage: npx tsx scripts/generate-arrangement-previews.ts
 * 出力: public/arrangements/{neon,stamp}.png
 *
 * ハンコは実際の描画（drawStampText）をそのまま使って生成する。以前は見た目を手描きで模造して
 * いたため、描画側を直すたびにプレビューだけ古い姿で取り残された。
 *
 * ネオンは手描きの模造（実描画のグローは小さなアイコンでは潰れる）。
 *
 * どちらも生成後に透明な余白を切り落とす。表示は高さ指定（h-5）なので、余白があるとそのぶん
 * 中身が小さくなり、かつ余白ごと横幅を占めて狭い端末でボタン幅をはみ出す。
 */

import fs from "fs";
import path from "path";
import { Canvas } from "skia-canvas";
import { ensureFontsLoaded } from "@/lib/image/fonts";
import { drawStampText } from "@/lib/image/stamp";
import { CANVAS_FONT_NAMES, MARGIN_RATIO } from "@/lib/image/text";
import { COLORS, DEFAULT_FONT } from "@/types";
import { trimTransparent } from "./lib/trimTransparent";

const OUTPUT_DIR = path.join(__dirname, "../public/arrangements");

// いずれも切り抜く前の作業キャンバス。実寸ではなく、描画に十分な広さと解像度があればよい。
const NEON_WIDTH = 400;
const NEON_HEIGHT = 140;
const NEON_FONT_SIZE = 56;

const STAMP_WIDTH = 600;
const STAMP_HEIGHT = 240;
const STAMP_FONT_SIZE = 80;
/** にじみが切れないぶんの余白を残す。 */
const STAMP_TRIM_PADDING = 2;

async function write(name: string, canvas: Canvas): Promise<void> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(outputPath, Buffer.from(await canvas.toBuffer("png")));
  console.log("Created:", outputPath);
}

async function generateNeonPreview(): Promise<void> {
  const canvas = new Canvas(NEON_WIDTH, NEON_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, NEON_WIDTH, NEON_HEIGHT);

  const text = "ネオン";
  ctx.font = `${NEON_FONT_SIZE}px "Noto Sans JP"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = NEON_WIDTH / 2;
  const y = NEON_HEIGHT / 2;

  // 外側グロー（シアン系で視認性を確保）
  ctx.shadowColor = "#00bfff";
  ctx.shadowBlur = NEON_FONT_SIZE * 0.43;
  ctx.fillStyle = "#00bfff";
  ctx.fillText(text, x, y);

  // 中間グロー
  ctx.shadowBlur = NEON_FONT_SIZE * 0.21;
  ctx.fillText(text, x, y);

  // 中心（白く光る芯）
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);

  await write("neon.png", trimTransparent(canvas));
}

async function generateStampPreview(): Promise<void> {
  ensureFontsLoaded();

  const canvas = new Canvas(STAMP_WIDTH, STAMP_HEIGHT);
  // 傾きは付けない。押すたびに変わる要素なので、選択肢のアイコンとしてはかすれの質感だけ見せる。
  drawStampText(
    canvas.getContext("2d"),
    "ハンコ",
    "top",
    STAMP_WIDTH,
    STAMP_HEIGHT,
    STAMP_FONT_SIZE,
    Math.max(10, Math.min(STAMP_WIDTH, STAMP_HEIGHT) * MARGIN_RATIO),
    COLORS.red,
    CANVAS_FONT_NAMES[DEFAULT_FONT],
    DEFAULT_FONT,
    { tilt: false }
  );

  await write("stamp.png", trimTransparent(canvas, STAMP_TRIM_PADDING));
}

async function main(): Promise<void> {
  await generateNeonPreview();
  await generateStampPreview();
  console.log("Done!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
