import sharp from "sharp";
import path from "path";
import heicConvert from "heic-convert";
import { Canvas, FontLibrary, CanvasRenderingContext2D } from "skia-canvas";
import {
  Position,
  Color,
  Size,
  FontFamily,
  OutputFormat,
  COLORS,
  SIZE_MULTIPLIERS,
  STROKE_COLORS,
  OUTPUT_CONFIG,
} from "@/types";

// フォントを登録
const fontsDir = path.join(process.cwd(), "fonts");
FontLibrary.use([
  path.join(fontsDir, "HuiFont29.ttf"),
  path.join(fontsDir, "NotoSansJP-Regular.ttf"),
  path.join(fontsDir, "LightNovelPOPv2.otf"),
]);

// フォント名のマッピング（skia-canvasはフォントファイル内のフォント名を使用）
const CANVAS_FONT_NAMES: Record<FontFamily, string> = {
  "hui-font": "HuiFont",
  "noto-sans-jp": "Noto Sans CJK JP",
  "light-novel-pop": "LightNovelPopV2",
};

interface ProcessImageParams {
  imageBuffer: Buffer;
  text: string;
  position: Position;
  color: Color;
  size: Size;
  font: FontFamily;
  output: OutputFormat;
  isHEIC?: boolean;
}

interface ProcessImageResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/**
 * HEICバッファをJPEGバッファに変換
 */
async function convertHEICtoJPEG(heicBuffer: Buffer): Promise<Buffer> {
  const outputBuffer = await heicConvert({
    buffer: heicBuffer,
    format: "JPEG",
    quality: 0.95,
  });
  return Buffer.from(outputBuffer);
}

/**
 * 画像サイズに基づいてフォントサイズを計算
 */
function calculateFontSize(
  width: number,
  height: number,
  position: Position,
  size: Size
): number {
  const isVertical = position === "left" || position === "right";
  const multiplier = SIZE_MULTIPLIERS[size];

  let baseFontSize: number;
  if (isVertical) {
    baseFontSize = Math.floor(height / 15);
  } else {
    baseFontSize = Math.floor(width / 20);
  }

  const fontSize = Math.floor(baseFontSize * multiplier);
  return Math.max(16, Math.min(fontSize, 300));
}

// 縦書き用の文字変換マッピング
const VERTICAL_CHAR_MAP: Record<string, string> = {
  "（": "︵", "）": "︶", "(": "︵", ")": "︶",
  "「": "﹁", "」": "﹂", "『": "﹃", "』": "﹄",
  "【": "︻", "】": "︼", "〔": "︹", "〕": "︺",
  "《": "︽", "》": "︾", "〈": "︿", "〉": "﹀",
  "[": "﹇", "]": "﹈", "{": "︷", "}": "︸",
  "ー": "丨", "―": "丨", "－": "丨", "-": "丨",
  "〜": "∣", "~": "∣",
};

const PUNCTUATION_CHARS = new Set(["、", "。", ",", "."]);

// マージン比率
const MARGIN_RATIO = 0.05;
// 縁取りの太さ（フォントサイズに対する比率）
const STROKE_WIDTH_RATIO = 0.08;

/**
 * テキストオーバーレイをCanvasで生成
 */
async function createTextOverlay(
  width: number,
  height: number,
  text: string,
  position: Position,
  fontSize: number,
  fontFamily: FontFamily,
  textColor: string,
  strokeColor: string
): Promise<Buffer> {
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");

  const fontName = CANVAS_FONT_NAMES[fontFamily];
  ctx.font = `${fontSize}px "${fontName}"`;
  ctx.textBaseline = "middle";

  const strokeWidth = Math.max(2, fontSize * STROKE_WIDTH_RATIO);
  const margin = Math.max(10, Math.min(width, height) * MARGIN_RATIO);

  const isVertical = position === "left" || position === "right";

  if (isVertical) {
    drawVerticalText(ctx, text, position, width, height, fontSize, margin, textColor, strokeColor, strokeWidth);
  } else {
    drawHorizontalText(ctx, text, position, width, height, fontSize, margin, textColor, strokeColor, strokeWidth);
  }

  return Buffer.from(await canvas.toBuffer("png"));
}

/**
 * 縁取り付きで文字を描画
 */
function drawTextWithStroke(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  textColor: string,
  strokeColor: string,
  strokeWidth: number
) {
  // 縁取り（ストローク）
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  ctx.strokeText(char, x, y);

  // 本体（フィル）
  ctx.fillStyle = textColor;
  ctx.fillText(char, x, y);
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
  strokeWidth: number
) {
  const chars = Array.from(text);
  const maxWidth = width - margin * 2;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / fontSize));
  const lineHeight = fontSize * 1.4;

  // 行に分割
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += charsPerLine) {
    lines.push(chars.slice(i, i + charsPerLine).join(""));
  }

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

    lineChars.forEach((char, charIndex) => {
      const x = margin + fontSize / 2 + charIndex * fontSize;
      drawTextWithStroke(ctx, char, x, y, textColor, strokeColor, strokeWidth);
    });
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
  strokeWidth: number
) {
  const chars = Array.from(text).map((char) => ({
    char: VERTICAL_CHAR_MAP[char] || char,
    isPunctuation: PUNCTUATION_CHARS.has(char),
  }));

  const maxHeight = height - margin * 2;
  const lineHeight = fontSize * 1.2;
  const charsPerColumn = Math.max(1, Math.floor(maxHeight / lineHeight));
  const columnWidth = fontSize * 1.5;

  // 列に分割
  const columns: typeof chars[] = [];
  for (let i = 0; i < chars.length; i += charsPerColumn) {
    columns.push(chars.slice(i, i + charsPerColumn));
  }

  // X開始位置（縦書きは右から左へ）
  let startX: number;
  if (position === "right") {
    startX = width - margin - fontSize / 2;
  } else {
    startX = margin + fontSize / 2 + (columns.length - 1) * columnWidth;
  }

  // Y開始位置（上揃え）
  const startY = margin + fontSize / 2;

  // 描画
  columns.forEach((column, colIndex) => {
    const x = startX - colIndex * columnWidth;

    column.forEach((charInfo, charIndex) => {
      const { char, isPunctuation } = charInfo;
      const baseY = startY + charIndex * lineHeight;

      // 句読点は右上に配置
      const charX = isPunctuation ? x + fontSize * 0.3 : x;
      const charY = isPunctuation ? baseY - fontSize * 0.3 : baseY;

      drawTextWithStroke(ctx, char, charX, charY, textColor, strokeColor, strokeWidth);
    });
  });
}

/**
 * 出力形式に応じてリサイズ・圧縮・フォーマット変換を適用
 */
async function applyOutputFormat(
  imageBuffer: Buffer,
  outputFormat: OutputFormat
): Promise<ProcessImageResult> {
  const config = OUTPUT_CONFIG[outputFormat];

  // 「なし」の場合はJPEGでそのまま返す
  if (!config) {
    return {
      buffer: imageBuffer,
      contentType: "image/jpeg",
      extension: "jpg",
    };
  }

  const { maxSize, maxFileSize, format } = config;
  let image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // 長辺がmaxSizeを超える場合はリサイズ
  if (width > maxSize || height > maxSize) {
    if (width > height) {
      image = image.resize(maxSize, null, { withoutEnlargement: true });
    } else {
      image = image.resize(null, maxSize, { withoutEnlargement: true });
    }
  }

  // AVIF出力
  if (format === "avif") {
    // 初回出力（quality 80）
    let result = await image.avif({ quality: 80 }).toBuffer();

    // ファイルサイズがmaxFileSizeを超える場合は圧縮
    if (result.length > maxFileSize) {
      for (let quality = 70; quality >= 20; quality -= 10) {
        result = await sharp(imageBuffer)
          .resize(
            width > height ? Math.min(width, maxSize) : null,
            height >= width ? Math.min(height, maxSize) : null,
            { withoutEnlargement: true }
          )
          .avif({ quality })
          .toBuffer();

        if (result.length <= maxFileSize) {
          break;
        }
      }
    }

    return {
      buffer: result,
      contentType: "image/avif",
      extension: "avif",
    };
  }

  // JPEG出力（フォールバック）
  return {
    buffer: imageBuffer,
    contentType: "image/jpeg",
    extension: "jpg",
  };
}

export async function processImage({
  imageBuffer,
  text,
  position,
  color,
  size,
  font,
  output,
  isHEIC = false,
}: ProcessImageParams): Promise<ProcessImageResult> {
  // HEICの場合は先にJPEGに変換
  let processableBuffer = imageBuffer;
  if (isHEIC) {
    processableBuffer = await convertHEICtoJPEG(imageBuffer);
  }

  const image = sharp(processableBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || 800;
  const height = metadata.height || 600;

  const fontSize = calculateFontSize(width, height, position, size);
  const textColor = COLORS[color];
  const strokeColor = STROKE_COLORS[color];

  // Canvasでテキストオーバーレイを生成
  const textOverlay = await createTextOverlay(
    width,
    height,
    text,
    position,
    fontSize,
    font,
    textColor,
    strokeColor
  );

  // 画像にテキストを合成してJPEGで一時出力
  const composited = await image
    .composite([
      {
        input: textOverlay,
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  // 出力形式に応じて変換
  const result = await applyOutputFormat(composited, output);

  return result;
}
