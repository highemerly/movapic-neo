import path from "path";
import { Canvas, FontLibrary, CanvasRenderingContext2D } from "skia-canvas";
import { Position, FontFamily, Arrangement } from "@/types";
import {
  PROPORTIONAL_FONTS,
  MONOSPACE_FONTS,
  VERTICAL_CHAR_MAP,
  ROTATE_CHARS,
  PUNCTUATION_CHARS,
  MARGIN_RATIO,
  STROKE_WIDTH_RATIO,
  splitTextIntoLines,
  drawTextWithStroke,
  getMonospaceCharWidth,
  isHalfWidthChar,
} from "./text";
import { drawStampText } from "./stamp";
import { drawNeonText } from "./neon";

// フォントを登録
const fontsDir = path.join(process.cwd(), "fonts");
// eslint-disable-next-line react-hooks/rules-of-hooks
FontLibrary.use([
  path.join(fontsDir, "HuiFont29.ttf"),
  path.join(fontsDir, "NotoSansJP-Regular.ttf"),
  path.join(fontsDir, "LightNovelPOPv2.otf"),
]);

// フォント名のマッピング（skia-canvasはフォントファイル内のフォント名を使用）
export const CANVAS_FONT_NAMES: Record<FontFamily, string> = {
  "hui-font": "HuiFont",
  "noto-sans-jp": "Noto Sans CJK JP",
  "light-novel-pop": "LightNovelPopV2",
};

/**
 * テキストオーバーレイをCanvasで生成
 */
export async function createTextOverlay(
  width: number,
  height: number,
  text: string,
  position: Position,
  fontSize: number,
  fontFamily: FontFamily,
  textColor: string,
  strokeColor: string,
  arrangement: Arrangement
): Promise<Buffer> {
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");

  const fontName = CANVAS_FONT_NAMES[fontFamily];
  ctx.font = `${fontSize}px "${fontName}"`;
  ctx.textBaseline = "middle";

  const strokeWidth = Math.max(2, fontSize * STROKE_WIDTH_RATIO);
  const margin = Math.max(10, Math.min(width, height) * MARGIN_RATIO);

  const isVertical = position === "left" || position === "right";

  // アレンジに応じた描画方法を選択
  if (arrangement === "stamp") {
    drawStampText(
      ctx,
      text,
      position,
      width,
      height,
      fontSize,
      margin,
      textColor,
      fontName,
      fontFamily
    );
  } else if (isVertical) {
    drawVerticalText(
      ctx,
      text,
      position as "left" | "right",
      width,
      height,
      fontSize,
      margin,
      textColor,
      strokeColor,
      strokeWidth,
      arrangement,
      fontFamily
    );
  } else {
    drawHorizontalText(
      ctx,
      text,
      position as "top" | "bottom",
      width,
      height,
      fontSize,
      margin,
      textColor,
      strokeColor,
      strokeWidth,
      arrangement,
      fontFamily
    );
  }

  return Buffer.from(await canvas.toBuffer("png"));
}

/**
 * 横書きテキストを描画
 */
function drawHorizontalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: "top" | "bottom",
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  textColor: string,
  strokeColor: string,
  strokeWidth: number,
  arrangement: Arrangement,
  fontFamily: FontFamily
): void {
  const maxWidth = width - margin * 2;
  const lineHeight = fontSize * 1.4;
  const useProportional = PROPORTIONAL_FONTS.has(fontFamily);
  const useHalfWidth = MONOSPACE_FONTS.has(fontFamily);

  // 行分割（プロポーショナル/等幅対応）
  const lines = splitTextIntoLines(ctx, text, maxWidth, useProportional, fontSize, useHalfWidth);

  // Y開始位置
  let startY: number;
  if (position === "top") {
    startY = margin + fontSize / 2;
  } else {
    const totalHeight = lines.length * lineHeight;
    startY = height - margin - totalHeight + fontSize / 2;
  }

  // 描画
  lines.forEach((line, lineIndex) => {
    const y = startY + lineIndex * lineHeight;
    const lineChars = Array.from(line);

    if (useProportional) {
      // プロポーショナル: 累積幅で配置
      let currentX = margin;
      lineChars.forEach((char) => {
        const charWidth = ctx.measureText(char).width;
        const x = currentX + charWidth / 2;
        if (arrangement === "neon") {
          drawNeonText(ctx, char, x, y, fontSize, textColor);
        } else {
          drawTextWithStroke(ctx, char, x, y, textColor, strokeColor, strokeWidth);
        }
        currentX += charWidth;
      });
    } else if (useHalfWidth) {
      // 等幅（半角対応）: 半角は0.5幅、全角は1.0幅
      let currentX = margin;
      lineChars.forEach((char) => {
        const charWidth = getMonospaceCharWidth(char, fontSize);
        const x = currentX + charWidth / 2;
        if (arrangement === "neon") {
          drawNeonText(ctx, char, x, y, fontSize, textColor);
        } else {
          drawTextWithStroke(ctx, char, x, y, textColor, strokeColor, strokeWidth);
        }
        currentX += charWidth;
      });
    } else {
      // 等幅（半角非対応）: 固定幅で配置
      lineChars.forEach((char, charIndex) => {
        const x = margin + fontSize / 2 + charIndex * fontSize;
        if (arrangement === "neon") {
          drawNeonText(ctx, char, x, y, fontSize, textColor);
        } else {
          drawTextWithStroke(ctx, char, x, y, textColor, strokeColor, strokeWidth);
        }
      });
    }
  });
}

/**
 * 縦書きテキストを描画
 */
function drawVerticalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: "left" | "right",
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  textColor: string,
  strokeColor: string,
  strokeWidth: number,
  arrangement: Arrangement,
  fontFamily: FontFamily
): void {
  const maxHeight = height - margin * 2;
  const lineHeight = fontSize * 1.2;
  const charsPerColumn = Math.max(1, Math.floor(maxHeight / lineHeight));
  const columnWidth = fontSize * 1.5;
  const useHalfWidth = MONOSPACE_FONTS.has(fontFamily);

  // 改行で分割し、各段落を高さに応じてさらに列に分割
  type CharInfo = { char: string; originalChar: string; isPunctuation: boolean; shouldRotate: boolean; isHalf: boolean };
  const columns: CharInfo[][] = [];
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    const chars = Array.from(paragraph).map((char) => ({
      char: VERTICAL_CHAR_MAP[char] || char,
      originalChar: char,
      isPunctuation: PUNCTUATION_CHARS.has(char),
      shouldRotate: ROTATE_CHARS.has(char),
      isHalf: useHalfWidth && isHalfWidthChar(char),
    }));
    if (chars.length === 0) {
      columns.push([]);
    } else {
      for (let i = 0; i < chars.length; i += charsPerColumn) {
        columns.push(chars.slice(i, i + charsPerColumn));
      }
    }
  }

  // X開始位置（縦書きは右から左へ）
  let startX: number;
  if (position === "right") {
    startX = width - margin - fontSize;
  } else {
    startX = margin + fontSize / 2 + (columns.length - 1) * columnWidth;
  }

  // Y開始位置（上揃え）
  const startY = margin + fontSize / 2;

  // 描画
  columns.forEach((column, colIndex) => {
    const x = startX - colIndex * columnWidth;

    column.forEach((charInfo, charIndex) => {
      const { char, isPunctuation, shouldRotate, isHalf } = charInfo;
      const baseY = startY + charIndex * lineHeight;

      // 半角文字はX位置を中央に寄せる（全角の中心に揃える）
      const halfXOffset = isHalf ? fontSize * 0.25 : 0;

      // 句読点は右上に配置
      const charX = isPunctuation ? x + fontSize * 0.3 : x + halfXOffset;
      const charY = isPunctuation ? baseY - fontSize * 0.3 : baseY;

      if (shouldRotate) {
        ctx.save();
        ctx.translate(charX, charY);
        ctx.rotate(Math.PI / 2);
        if (arrangement === "neon") {
          drawNeonText(ctx, char, 0, 0, fontSize, textColor);
        } else {
          drawTextWithStroke(ctx, char, 0, 0, textColor, strokeColor, strokeWidth);
        }
        ctx.restore();
      } else if (arrangement === "neon") {
        drawNeonText(ctx, char, charX, charY, fontSize, textColor);
      } else {
        drawTextWithStroke(ctx, char, charX, charY, textColor, strokeColor, strokeWidth);
      }
    });
  });
}
