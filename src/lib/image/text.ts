import { CanvasRenderingContext2D } from "skia-canvas";
import { FontFamily, Size, Position } from "@/types";
import { SIZE_MULTIPLIERS } from "@/types";

// プロポーショナルフォント（横書き時のみ）
export const PROPORTIONAL_FONTS: Set<FontFamily> = new Set(["noto-sans-jp"]);

// 等幅フォント（半角文字の幅を半分にする）
export const MONOSPACE_FONTS: Set<FontFamily> = new Set(["hui-font", "light-novel-pop"]);

/**
 * 半角文字かどうかを判定
 * 半角英数字、半角カタカナ、ASCII記号を半角として扱う
 */
export function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  // ASCII（0x0020-0x007E）: 半角英数字・記号
  if (code >= 0x0020 && code <= 0x007e) {
    return true;
  }
  // 半角カタカナ（0xFF61-0xFF9F）
  if (code >= 0xff61 && code <= 0xff9f) {
    return true;
  }
  return false;
}

/**
 * 等幅フォントでの文字幅を取得（半角は0.5、全角は1.0）
 */
export function getMonospaceCharWidth(char: string, fontSize: number): number {
  return isHalfWidthChar(char) ? fontSize * 0.5 : fontSize;
}

// 縦書き用の文字変換マッピング（長音のみ変換、括弧は回転で対応）
export const VERTICAL_CHAR_MAP: Record<string, string> = {
  "ー": "丨",
  "―": "丨",
  "－": "丨",
  "-": "丨",
  "〜": "∣",
  "~": "∣",
};

// 縦書き時に90度回転させる文字（括弧類）
export const ROTATE_CHARS = new Set([
  "（", "）", "(", ")",
  "「", "」", "『", "』",
  "【", "】", "〔", "〕",
  "《", "》", "〈", "〉",
  "[", "]", "{", "}",
  "｛", "｝", "［", "］",
]);

export const PUNCTUATION_CHARS = new Set(["、", "。", ",", "."]);

// マージン比率
export const MARGIN_RATIO = 0.05;
// 縁取りの太さ（フォントサイズに対する比率）
export const STROKE_WIDTH_RATIO = 0.08;

/**
 * 画像サイズに基づいてフォントサイズを計算
 */
export function calculateFontSize(
  width: number,
  height: number,
  position: Position,
  size: Size
): number {
  const isVertical = position === "left" || position === "right";
  const multiplier = SIZE_MULTIPLIERS[size];

  // 基準サイズ（全体を約15%大きく調整済み）
  let baseFontSize: number;
  if (isVertical) {
    baseFontSize = Math.floor(height / 13);
  } else {
    baseFontSize = Math.floor(width / 17);
  }

  const fontSize = Math.floor(baseFontSize * multiplier);
  return Math.max(16, Math.min(fontSize, 500));
}

/**
 * テキストを行に分割
 */
export function splitTextIntoLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  useProportional: boolean,
  fontSize: number,
  useHalfWidth: boolean = false
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }

    if (useProportional) {
      // プロポーショナル: 文字幅を累積して改行判定
      let currentLine = "";
      let currentWidth = 0;

      for (const char of paragraph) {
        const charWidth = ctx.measureText(char).width;
        if (currentWidth + charWidth > maxWidth && currentLine !== "") {
          lines.push(currentLine);
          currentLine = char;
          currentWidth = charWidth;
        } else {
          currentLine += char;
          currentWidth += charWidth;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    } else if (useHalfWidth) {
      // 等幅（半角対応）: 半角は0.5幅、全角は1.0幅として計算
      let currentLine = "";
      let currentWidth = 0;

      for (const char of paragraph) {
        const charWidth = getMonospaceCharWidth(char, fontSize);
        if (currentWidth + charWidth > maxWidth && currentLine !== "") {
          lines.push(currentLine);
          currentLine = char;
          currentWidth = charWidth;
        } else {
          currentLine += char;
          currentWidth += charWidth;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    } else {
      // 等幅（半角非対応）: 固定文字数で分割
      const chars = Array.from(paragraph);
      const charsPerLine = Math.max(1, Math.floor(maxWidth / fontSize));
      for (let i = 0; i < chars.length; i += charsPerLine) {
        lines.push(chars.slice(i, i + charsPerLine).join(""));
      }
    }
  }

  return lines;
}

/**
 * HEX色をRGBオブジェクトに変換
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 255, g: 255, b: 255 };
}

/**
 * 縁取り付きで文字を描画（通常）
 */
export function drawTextWithStroke(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  textColor: string,
  strokeColor: string,
  strokeWidth: number
): void {
  // 縁取り（ストローク）
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  ctx.strokeText(char, x, y);

  // 本体（フィル）
  ctx.fillStyle = textColor;
  ctx.fillText(char, x, y);
}

