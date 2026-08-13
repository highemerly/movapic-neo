/**
 * フォント選択（OptionsPanel のセグメントコントロール）に出すプレビュー画像を生成する。
 *
 * Usage: npx tsx scripts/generate-font-previews.ts
 * 出力: public/fonts/{id}.png
 *
 * 生成後に透明な余白を切り落とす。以前は 200x50 のキャンバスに小さく描いていたため、
 * 表示高さ（h-5）のうち字が使えるのは半分ほどしかなく、UI上で読みにくかった。
 *
 * ※ライセンスページ用の大きな見本画像は別物（scripts/generate-font-samples.js）。
 */

import fs from "fs";
import path from "path";
import { Canvas, FontLibrary } from "skia-canvas";
import { trimTransparent } from "./lib/trimTransparent";

// 切り抜く前の作業キャンバス。実寸ではなく、描画に十分な広さがあればよい。
const WIDTH = 400;
const HEIGHT = 100;
const FONT_SIZE = 48;

const fonts = [
  { id: "hui-font", file: "HuiFont29.ttf", text: "ふい字" },
  { id: "noto-sans-jp", file: "NotoSansJP-Regular.ttf", text: "Noto Sans JP" },
  { id: "light-novel-pop", file: "LightNovelPOPv2.otf", text: "ラノベPOP" },
];

async function generateFontPreview(font: (typeof fonts)[number]): Promise<void> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  FontLibrary.use(font.id, path.join(__dirname, "../fonts", font.file));

  const canvas = new Canvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  ctx.font = `${FONT_SIZE}px "${font.id}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 黒で焼き込み、ダークテーマ側は dark:invert で白抜きにする（OptionsPanel）。
  ctx.fillStyle = "#000000";
  ctx.fillText(font.text, WIDTH / 2, HEIGHT / 2);

  const outputPath = path.join(__dirname, "../public/fonts", `${font.id}.png`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(await trimTransparent(canvas).toBuffer("png")));
  console.log("Created:", outputPath);
}

async function main(): Promise<void> {
  for (const font of fonts) {
    await generateFontPreview(font);
  }
  console.log("Done!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
