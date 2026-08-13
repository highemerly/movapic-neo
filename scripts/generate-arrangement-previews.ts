/**
 * アレンジ選択（OptionsPanel のセグメントコントロール）に出すプレビュー画像を生成する。
 *
 * Usage: npx tsx scripts/generate-arrangement-previews.ts
 *
 * ハンコは実際の描画（createTextOverlay の arrangement="stamp"）をそのまま使って生成する。
 * 以前は見た目を手描きで模造していたため、描画側を直すたびにプレビューだけ古い姿で取り残された。
 * 生成後に不透明な画素の外接矩形で切り抜くので、印面が画像いっぱいに収まる。
 *
 * ネオンは元から手描きの模造（実描画のグローは小さなアイコンでは潰れる）。
 */

import fs from "fs";
import path from "path";
import { Canvas } from "skia-canvas";
import { ensureFontsLoaded } from "@/lib/image/fonts";
import { drawStampText } from "@/lib/image/stamp";
import { CANVAS_FONT_NAMES, MARGIN_RATIO } from "@/lib/image/text";
import { COLORS, DEFAULT_FONT } from "@/types";

const OUTPUT_DIR = path.join(__dirname, "../public/arrangements");

const NEON_WIDTH = 200;
const NEON_HEIGHT = 50;

/** ハンコ描画用の作業キャンバス。切り抜き前提なので実寸ではなく解像度を稼ぐための大きさ。 */
const STAMP_CANVAS_WIDTH = 600;
const STAMP_CANVAS_HEIGHT = 240;
/** 出力の高さが 20px 表示（h-5）の6倍程度になるフォントサイズ。 */
const STAMP_FONT_SIZE = 80;
/** 切り抜きの余白（にじみが切れないぶんだけ）。 */
const STAMP_CROP_PADDING = 2;

function write(name: string, buffer: Buffer): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(outputPath, buffer);
  console.log("Created:", outputPath);
}

async function generateNeonPreview(): Promise<void> {
  const canvas = new Canvas(NEON_WIDTH, NEON_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, NEON_WIDTH, NEON_HEIGHT);

  const text = "ネオン";
  const fontSize = 28;
  ctx.font = `${fontSize}px "Noto Sans JP"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = NEON_WIDTH / 2;
  const y = NEON_HEIGHT / 2;

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

  write("neon.png", Buffer.from(await canvas.toBuffer("png")));
}

/** 不透明な画素の外接矩形。 */
function inkBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 4) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("ハンコが描画されていない");
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function generateStampPreview(): Promise<void> {
  ensureFontsLoaded();

  const source = new Canvas(STAMP_CANVAS_WIDTH, STAMP_CANVAS_HEIGHT);
  const sourceCtx = source.getContext("2d");
  // 傾きは付けない。押すたびに変わる要素なので、選択肢のアイコンとしてはかすれの質感だけ見せる。
  drawStampText(
    sourceCtx,
    "ハンコ",
    "top",
    STAMP_CANVAS_WIDTH,
    STAMP_CANVAS_HEIGHT,
    STAMP_FONT_SIZE,
    Math.max(10, Math.min(STAMP_CANVAS_WIDTH, STAMP_CANVAS_HEIGHT) * MARGIN_RATIO),
    COLORS.red,
    CANVAS_FONT_NAMES[DEFAULT_FONT],
    DEFAULT_FONT,
    { tilt: false }
  );

  const bounds = inkBounds(
    sourceCtx.getImageData(0, 0, STAMP_CANVAS_WIDTH, STAMP_CANVAS_HEIGHT).data,
    STAMP_CANVAS_WIDTH,
    STAMP_CANVAS_HEIGHT
  );

  const pad = STAMP_CROP_PADDING;
  const canvas = new Canvas(bounds.width + pad * 2, bounds.height + pad * 2);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, -bounds.x + pad, -bounds.y + pad);

  write("stamp.png", Buffer.from(await canvas.toBuffer("png")));
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
