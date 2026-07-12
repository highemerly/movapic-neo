import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { createTextOverlay } from "./overlay";
import { calculateFontSize } from "./text";
import { COLORS, STROKE_COLORS, type Position, type Color, type Size, type FontFamily, type Arrangement } from "@/types";

/**
 * ゴールデン画像（スナップショット）テスト。
 *
 * createTextOverlay が返す skia の PNG（可逆）をコミット済みの正解と突き合わせ、
 * レイアウト・折り返し・影・回転・ネオン・ハンコ等の「見た目」の退行を検出する。
 * 最終 AVIF/JPEG は libvips のバージョン差で脆いので比較しない（別途 mime/寸法のみ）。
 *
 * 正解は本番同一の Docker 環境で生成する（mac で作るとレンダラ差でズレる）:
 *   GOLDEN_UPDATE=1 npm run test:golden
 * 失敗時の差分を見たいとき（CI がアーティファクト化する）:
 *   GOLDEN_DIFF_DIR=/out npm run test:golden
 */

const GOLDEN_DIR = path.join(__dirname, "__golden__");
const UPDATE = process.env.GOLDEN_UPDATE === "1";
const DIFF_DIR = process.env.GOLDEN_DIFF_DIR || "";
// 同一環境なら決定的なので完全一致を要求する。差分は DIFF_DIR に書き出して目視できる。
const ALLOWED_DIFF_PIXELS = 0;

interface Case {
  name: string;
  width: number;
  height: number;
  text: string;
  position: Position;
  color: Color;
  size: Size;
  font: FontFamily;
  arrangement: Arrangement;
}

const CASES: Case[] = [
  { name: "h-top-basic", width: 400, height: 400, text: "こんにちは世界", position: "top", color: "white", size: "medium", font: "hui-font", arrangement: "none" },
  { name: "h-bottom-wrap", width: 400, height: 400, text: "画像幅に収まらない長いテキストは自動で折り返します", position: "bottom", color: "white", size: "medium", font: "hui-font", arrangement: "none" },
  { name: "h-multiline", width: 400, height: 400, text: "1行目\n2行目\n3行目", position: "top", color: "white", size: "medium", font: "hui-font", arrangement: "none" },
  { name: "v-right", width: 400, height: 600, text: "縦書きは右から左へ", position: "right", color: "white", size: "medium", font: "hui-font", arrangement: "none" },
  { name: "v-left", width: 400, height: 600, text: "左寄せの縦書き", position: "left", color: "white", size: "medium", font: "hui-font", arrangement: "none" },
  { name: "v-punctuation", width: 400, height: 600, text: "「あ、」。（笑）ー", position: "right", color: "white", size: "medium", font: "hui-font", arrangement: "none" },
  { name: "extra-large", width: 400, height: 400, text: "大", position: "top", color: "red", size: "extra-large", font: "hui-font", arrangement: "none" },
  { name: "shadow-dark", width: 400, height: 400, text: "青は白影", position: "top", color: "blue", size: "large", font: "hui-font", arrangement: "none" },
  { name: "neon", width: 400, height: 400, text: "ネオン", position: "top", color: "green", size: "large", font: "hui-font", arrangement: "neon" },
  // 注: アレンジ "stamp"（ハンコ）は手描き風の枠を Math.random() で毎回ゆらがせる意図的な非決定的描画のため、
  // ピクセル比較のゴールデンには載せられない（描画ロジックは image/text の単体テスト側で担保）。
  { name: "gothic-proportional", width: 500, height: 300, text: "Proportional な字詰め ABC", position: "top", color: "white", size: "medium", font: "noto-sans-jp", arrangement: "none" },
  { name: "emoji", width: 400, height: 400, text: "絵文字😀🎉", position: "top", color: "white", size: "large", font: "hui-font", arrangement: "none" },
];

async function renderCase(c: Case): Promise<Buffer> {
  const fontSize = calculateFontSize(c.width, c.height, c.position, c.size);
  return createTextOverlay(
    c.width,
    c.height,
    c.text,
    c.position,
    fontSize,
    c.font,
    COLORS[c.color],
    STROKE_COLORS[c.color],
    c.arrangement,
    null
  );
}

async function writeDiffArtifacts(name: string, actual: PNG, expected: PNG, diff: PNG) {
  if (!DIFF_DIR) return;
  await fs.mkdir(DIFF_DIR, { recursive: true });
  await fs.writeFile(path.join(DIFF_DIR, `${name}.actual.png`), PNG.sync.write(actual));
  await fs.writeFile(path.join(DIFF_DIR, `${name}.expected.png`), PNG.sync.write(expected));
  await fs.writeFile(path.join(DIFF_DIR, `${name}.diff.png`), PNG.sync.write(diff));
}

describe("createTextOverlay ゴールデン画像", () => {
  it.each(CASES)("$name", async (c) => {
    const buffer = await renderCase(c);
    const actual = PNG.sync.read(buffer);
    const file = path.join(GOLDEN_DIR, `${c.name}.png`);

    if (UPDATE) {
      await fs.mkdir(GOLDEN_DIR, { recursive: true });
      await fs.writeFile(file, PNG.sync.write(actual));
      return;
    }

    let expectedBuf: Buffer;
    try {
      expectedBuf = await fs.readFile(file);
    } catch {
      throw new Error(
        `正解画像がありません: ${c.name}.png。Docker 環境で GOLDEN_UPDATE=1 npm run test:golden を実行してコミットしてください。`
      );
    }
    const expected = PNG.sync.read(expectedBuf);

    // 寸法が違えば即失敗（pixelmatch は同寸法前提）
    expect({ w: actual.width, h: actual.height }).toEqual({ w: expected.width, h: expected.height });

    const { width, height } = expected;
    const diff = new PNG({ width, height });
    const numDiff = pixelmatch(actual.data, expected.data, diff.data, width, height, { threshold: 0.1 });

    if (numDiff > ALLOWED_DIFF_PIXELS) {
      await writeDiffArtifacts(c.name, actual, expected, diff);
    }
    expect(numDiff).toBeLessThanOrEqual(ALLOWED_DIFF_PIXELS);
  });
});
