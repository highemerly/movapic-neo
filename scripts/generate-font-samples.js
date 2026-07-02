/**
 * フォントライセンスページ（/license）用のフォント見本画像を生成する。
 *
 * 各フォントで同じサンプル文字列を実際に描画し、フォントの雰囲気が分かる画像にする。
 * Noto Emoji は日本語グリフを持たない（＝本文サンプルは豆腐になる）ため、絵文字の見本にする。
 *
 * 背景は透過・文字はダーク色で焼き込む。ページ側は light テーマではそのまま、
 * dark テーマでは `dark:invert` で反転させる（→ 白抜き文字）。白背景を焼かないので
 * ダークモードで白い矩形がまぶしくなる問題を避けられる。
 *
 * skia-canvas は AVIF を直接吐けないので、PNG バッファを sharp で AVIF（アルファ付き）に変換する。
 *
 * Usage: node scripts/generate-font-samples.js
 * 出力: public/font-samples/{id}.avif
 *
 * ※フォント選択UI（OptionsPanel）が使う public/fonts/{id}.png（200x50・小さいラベル）とは別物。
 *   そちらは scripts/generate-font-previews.js。
 */

/* eslint-disable @typescript-eslint/no-require-imports, react-hooks/rules-of-hooks */
const { Canvas, FontLibrary } = require("skia-canvas");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// 日本語（宮沢賢治『ポラーノの広場』からの引用・ページに出典明記）＋ ラテン ＋ 数字。
// 改行（\n）で段落を分ける。
const SAMPLE = [
  "あのイーハトーヴォのすきとおった風、夏でも底に冷たさをもつ青いそら、うつくしい森で飾られたモリーオ市、郊外のぎらぎらひかる草の波。",
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "12344567890",
].join("\n");
// 絵文字フォントは日本語を描けないので、雰囲気が分かるよう色々な絵文字を並べた見本にする
const EMOJI_SAMPLE = "😀 🍊 🍣 📅 ✨ 🎉 🐱 🌸 ⚽";

const fonts = [
  { id: "noto-sans-jp", file: "NotoSansJP-Regular.ttf", text: SAMPLE },
  { id: "hui-font", file: "HuiFont29.ttf", text: SAMPLE },
  { id: "light-novel-pop", file: "LightNovelPOPv2.otf", text: SAMPLE },
  { id: "noto-emoji", file: "NotoEmoji-VariableFont_wght.ttf", text: EMOJI_SAMPLE },
];

const SCALE = 2; // Retina 用に2倍で焼く
const WIDTH = 600; // 論理px（ページの max-w-2xl 内に収まる）
const PAD = 24;
const FONT_SIZE = 24;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.6);
const FG = "#1f2937"; // slate-800 相当（背景は透過。dark テーマでは dark:invert で白抜きにする）

// CJK（かな・漢字・全角記号）は1文字ずつ、ラテン/数字は単語単位で折り返すためのトークン化。
const isCjk = (ch) =>
  /[぀-ヿ㐀-鿿豈-﫿＀-￯　-〿]/.test(ch);

function tokenize(text) {
  const tokens = [];
  let word = "";
  for (const ch of Array.from(text)) {
    if (ch === " ") {
      if (word) { tokens.push(word); word = ""; }
      tokens.push(" ");
    } else if (isCjk(ch)) {
      if (word) { tokens.push(word); word = ""; }
      tokens.push(ch);
    } else {
      word += ch; // ラテン・数字・半角記号は語としてまとめる
    }
  }
  if (word) tokens.push(word);
  return tokens;
}

/** 幅 maxWidth に収まるよう折り返す。\n は強制改行。ラテンは単語途中で割らない。 */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const tok of tokenize(para)) {
      const next = line + tok;
      if (ctx.measureText(next).width > maxWidth && line.trim() !== "") {
        lines.push(line.replace(/\s+$/, ""));
        line = tok === " " ? "" : tok;
      } else {
        line = next;
      }
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines;
}

async function generate(font) {
  const fontPath = path.join(__dirname, "../fonts", font.file);
  FontLibrary.use(font.id, fontPath);

  // まず幅計測用に一時 canvas で折り返しを確定
  const contentWidth = WIDTH - PAD * 2;
  const measure = new Canvas(WIDTH * SCALE, LINE_HEIGHT * SCALE).getContext("2d");
  measure.font = `${FONT_SIZE * SCALE}px "${font.id}"`;
  const lines = wrapText(measure, font.text, contentWidth * SCALE);

  const height = PAD * 2 + lines.length * LINE_HEIGHT;
  const canvas = new Canvas(WIDTH * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");

  // 背景は透過のまま（塗らない）
  ctx.font = `${FONT_SIZE * SCALE}px "${font.id}"`;
  ctx.fillStyle = FG;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  lines.forEach((l, i) => {
    ctx.fillText(l, PAD * SCALE, (PAD + i * LINE_HEIGHT) * SCALE);
  });

  const png = await canvas.toBuffer("png");
  // 線画・文字＋透過なので AVIF が非常に小さくなる。アルファは sharp が保持する。
  const avif = await sharp(png).avif({ quality: 60, effort: 6 }).toBuffer();
  const outputPath = path.join(__dirname, "../public/font-samples", `${font.id}.avif`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, avif);
  console.log("Created:", outputPath, `(${WIDTH}x${height}, ${lines.length} lines, ${avif.length}B)`);
}

async function main() {
  for (const font of fonts) {
    await generate(font);
  }
  console.log("Done!");
}

main().catch(console.error);
