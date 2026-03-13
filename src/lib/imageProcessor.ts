import sharp from "sharp";
import * as jpeg from "jpeg-js";
import path from "path";
import { Canvas, FontLibrary, CanvasRenderingContext2D } from "skia-canvas";
import {
  Position,
  Color,
  Size,
  FontFamily,
  OutputFormat,
  Arrangement,
  COLORS,
  SIZE_MULTIPLIERS,
  STROKE_COLORS,
  OUTPUT_CONFIG,
} from "@/types";
import { ImageProcessError } from "@/lib/errors";

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
  arrangement: Arrangement;
  requestId?: string;
}

interface ProcessImageResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
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

  // 基準サイズ（全体を約15%大きく調整済み）
  let baseFontSize: number;
  if (isVertical) {
    baseFontSize = Math.floor(height / 13);
  } else {
    baseFontSize = Math.floor(width / 17);
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
 * HEX色をRGBオブジェクトに変換
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
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
    drawStampText(ctx, text, position, width, height, fontSize, margin, textColor, fontName);
  } else if (isVertical) {
    drawVerticalText(ctx, text, position, width, height, fontSize, margin, textColor, strokeColor, strokeWidth, arrangement);
  } else {
    drawHorizontalText(ctx, text, position, width, height, fontSize, margin, textColor, strokeColor, strokeWidth, arrangement);
  }

  return Buffer.from(await canvas.toBuffer("png"));
}

/**
 * 縁取り付きで文字を描画（通常）
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
 * ネオン効果で文字を描画
 * 複数レイヤーの発光効果（揺れなし）
 */
function drawNeonText(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  fontSize: number,
  textColor: string
) {
  ctx.save();

  // 外側グロー（大きくぼかし、選択色で発光）
  ctx.shadowColor = textColor;
  ctx.shadowBlur = fontSize * 0.5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = textColor;
  ctx.fillText(char, x, y);

  // 中間グロー
  ctx.shadowBlur = fontSize * 0.25;
  ctx.fillText(char, x, y);

  // 内側グロー
  ctx.shadowBlur = fontSize * 0.1;
  ctx.fillText(char, x, y);

  // 中心（白く光る芯）
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(char, x, y);

  ctx.restore();
}

/**
 * ハンコ効果で文字を描画
 * 斜め配置 + 枠線 + かすれ効果
 */
function drawStampText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Position,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  textColor: string,
  fontName: string
) {
  const chars = Array.from(text);
  const isVertical = position === "left" || position === "right";
  const rgb = hexToRgb(textColor);

  // テキストの配置を計算
  let textWidth: number;
  let textHeight: number;
  let columns: string[][];
  let lines: string[];

  // 縦書き/横書きで共通の行間・列幅
  const verticalLineHeight = fontSize * 1.2;
  const verticalColumnWidth = fontSize * 1.5;
  const horizontalLineHeight = fontSize * 1.4;

  if (isVertical) {
    // 縦書き: 列ごとに分割
    const maxHeight = height - margin * 2;
    const charsPerColumn = Math.max(1, Math.floor((maxHeight - margin * 2) / verticalLineHeight));
    columns = [];
    for (let i = 0; i < chars.length; i += charsPerColumn) {
      columns.push(chars.slice(i, i + charsPerColumn));
    }
    // 列幅 × 列数（最後の列も同じ幅を確保）
    textWidth = columns.length * verticalColumnWidth;
    // 最大文字数 × 行高（最後の文字も同じ高さを確保）
    const maxCharsInColumn = Math.min(chars.length, charsPerColumn);
    textHeight = maxCharsInColumn * verticalLineHeight;
    lines = [];
  } else {
    // 横書き: 行ごとに分割
    const maxWidth = width - margin * 2;
    const charsPerLine = Math.max(1, Math.floor((maxWidth - margin * 2) / fontSize));
    lines = [];
    for (let i = 0; i < chars.length; i += charsPerLine) {
      lines.push(chars.slice(i, i + charsPerLine).join(""));
    }
    // 文字数 × 文字幅
    textWidth = Math.min(chars.length, charsPerLine) * fontSize;
    // 行数 × 行高
    textHeight = lines.length * horizontalLineHeight;
    columns = [];
  }

  // 枠の位置を決定
  let boxX: number;
  let boxY: number;
  const padding = fontSize * 0.3;

  if (position === "top") {
    boxX = margin;
    boxY = margin;
  } else if (position === "bottom") {
    boxX = margin;
    boxY = height - margin - textHeight - padding * 2;
  } else if (position === "right") {
    boxX = width - margin - textWidth - padding * 2;
    boxY = margin;
  } else {
    // left
    boxX = margin;
    boxY = margin;
  }

  const boxWidth = textWidth + padding * 2;
  const boxHeight = textHeight + padding * 2;

  // 中心を基準に回転
  const centerX = boxX + boxWidth / 2;
  const centerY = boxY + boxHeight / 2;
  const rotationAngle = -7.5 * (Math.PI / 180); // -7.5度

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationAngle);
  ctx.translate(-centerX, -centerY);

  // 角丸の半径
  const cornerRadius = fontSize * 0.3; // 角丸を強化
  const wobbleAmount = fontSize * 0.1; // 歪みの大きさ（控えめに）

  // 背景色を描画（文字色の薄い版）
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
  ctx.fillRect(boxX - fontSize * 0.1, boxY - fontSize * 0.1, boxWidth + fontSize * 0.2, boxHeight + fontSize * 0.2);

  // 枠線を描画（手彫り風の歪んだ角丸枠）
  ctx.lineWidth = fontSize * 0.1; // 太めの枠線
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // 歪んだ角丸四角形を描画
  const segments = 4; // 各辺を分割する数

  ctx.beginPath();

  // 左上角丸スタート
  const startX = boxX + cornerRadius + (Math.random() - 0.5) * wobbleAmount;
  const startY = boxY + (Math.random() - 0.5) * wobbleAmount;
  ctx.moveTo(startX, startY);

  // 上辺
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const targetX = boxX + cornerRadius + (boxWidth - cornerRadius * 2) * t;
    ctx.lineTo(
      targetX + (Math.random() - 0.5) * wobbleAmount,
      boxY + (Math.random() - 0.5) * wobbleAmount * 0.8
    );
  }

  // 右上角丸
  ctx.quadraticCurveTo(
    boxX + boxWidth + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxY + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxX + boxWidth + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxY + cornerRadius + (Math.random() - 0.5) * wobbleAmount
  );

  // 右辺
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const targetY = boxY + cornerRadius + (boxHeight - cornerRadius * 2) * t;
    ctx.lineTo(
      boxX + boxWidth + (Math.random() - 0.5) * wobbleAmount * 0.8,
      targetY + (Math.random() - 0.5) * wobbleAmount
    );
  }

  // 右下角丸
  ctx.quadraticCurveTo(
    boxX + boxWidth + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxY + boxHeight + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxX + boxWidth - cornerRadius + (Math.random() - 0.5) * wobbleAmount,
    boxY + boxHeight + (Math.random() - 0.5) * wobbleAmount * 0.8
  );

  // 下辺
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const targetX = boxX + boxWidth - cornerRadius - (boxWidth - cornerRadius * 2) * t;
    ctx.lineTo(
      targetX + (Math.random() - 0.5) * wobbleAmount,
      boxY + boxHeight + (Math.random() - 0.5) * wobbleAmount * 0.8
    );
  }

  // 左下角丸
  ctx.quadraticCurveTo(
    boxX + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxY + boxHeight + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxX + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxY + boxHeight - cornerRadius + (Math.random() - 0.5) * wobbleAmount
  );

  // 左辺
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const targetY = boxY + boxHeight - cornerRadius - (boxHeight - cornerRadius * 2) * t;
    ctx.lineTo(
      boxX + (Math.random() - 0.5) * wobbleAmount * 0.8,
      targetY + (Math.random() - 0.5) * wobbleAmount
    );
  }

  // 左上角丸
  ctx.quadraticCurveTo(
    boxX + (Math.random() - 0.5) * wobbleAmount * 0.8,
    boxY + (Math.random() - 0.5) * wobbleAmount * 0.8,
    startX,
    startY
  );

  ctx.closePath();

  // 枠線を複数回描画してかすれ感を出す（縁取り付き）
  const frameStrokeWidth = fontSize * 0.02; // 枠の縁取り幅
  for (let layer = 0; layer < 4; layer++) {
    const layerAlpha = 0.5 + Math.random() * 0.4; // より濃く
    // 外側の縁取り（白）
    ctx.strokeStyle = `rgba(255, 255, 255, ${layerAlpha * 0.5})`;
    ctx.lineWidth = fontSize * 0.1 + frameStrokeWidth * 2;
    ctx.stroke();
    // 内側の本体（選択色）
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${layerAlpha})`;
    ctx.lineWidth = fontSize * 0.1;
    ctx.stroke();
  }

  // フォント設定
  ctx.font = `${fontSize}px "${fontName}"`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // 文字の縁取り幅
  const textStrokeWidth = fontSize * 0.03;

  // インクのムラを生成（位置に基づく濃淡パターン）
  // ハンコ全体で複数箇所の「インクが薄い/濃い」エリアを作る
  const inkPatterns = [
    { x: Math.random(), y: Math.random(), intensity: Math.random() < 0.5 ? 0.2 : 0.9, radius: 0.3 + Math.random() * 0.3 },
    { x: Math.random(), y: Math.random(), intensity: Math.random() < 0.5 ? 0.3 : 1.0, radius: 0.2 + Math.random() * 0.3 },
    { x: Math.random(), y: Math.random(), intensity: Math.random() < 0.5 ? 0.15 : 0.85, radius: 0.25 + Math.random() * 0.25 },
    { x: Math.random(), y: Math.random(), intensity: Math.random() < 0.5 ? 0.25 : 0.95, radius: 0.2 + Math.random() * 0.2 },
  ];

  // 位置に基づいてインクの濃さを計算
  const getInkAlpha = (normalizedX: number, normalizedY: number): number => {
    let alpha = 0.85; // ベースの濃さ（しっかり見える）

    for (const pattern of inkPatterns) {
      const dist = Math.sqrt(
        Math.pow(normalizedX - pattern.x, 2) + Math.pow(normalizedY - pattern.y, 2)
      );
      // 各パターンの影響範囲内なら濃淡を適用
      if (dist < pattern.radius) {
        const influence = 1 - (dist / pattern.radius); // 中心ほど強い影響
        alpha = alpha * (1 - influence * 0.5) + pattern.intensity * influence * 0.5;
      }
    }

    // ランダムなかすれも追加（控えめに）
    alpha += (Math.random() - 0.5) * 0.2;

    // 完全に消える部分も作る（3%の確率で薄くなる）
    if (Math.random() < 0.03) {
      alpha *= 0.5;
    }

    return Math.max(0.4, Math.min(1.0, alpha)); // 最小でも40%の濃さ
  };

  if (isVertical) {
    // 縦書き描画
    const firstColumnCenterX = boxX + boxWidth - padding - verticalColumnWidth / 2;
    const firstCharCenterY = boxY + padding + verticalLineHeight / 2;

    columns.forEach((column, colIndex) => {
      column.forEach((char, charIndex) => {
        // 手書き風ずれ（強化）
        const offsetX = (Math.random() - 0.5) * fontSize * 0.15;
        const offsetY = (Math.random() - 0.5) * fontSize * 0.15;
        const rotation = (Math.random() - 0.5) * 0.1; // ±5度

        // 位置に基づくインクムラ
        const normalizedX = colIndex / Math.max(1, columns.length - 1);
        const normalizedY = charIndex / Math.max(1, column.length - 1);
        const alpha = getInkAlpha(normalizedX, normalizedY);

        const mappedChar = VERTICAL_CHAR_MAP[char] || char;
        const x = firstColumnCenterX - colIndex * verticalColumnWidth + offsetX;
        const y = firstCharCenterY + charIndex * verticalLineHeight + offsetY;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);

        // 縁取り（白）
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        ctx.lineWidth = textStrokeWidth;
        ctx.strokeText(mappedChar, 0, 0);
        // 本体（選択色）
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        ctx.fillText(mappedChar, 0, 0);

        ctx.restore();
      });
    });
  } else {
    // 横書き描画
    const firstCharCenterX = boxX + padding + fontSize / 2;
    const firstLineCenterY = boxY + padding + horizontalLineHeight / 2;

    lines.forEach((line, lineIndex) => {
      const lineChars = Array.from(line);
      lineChars.forEach((char, charIndex) => {
        // 手書き風ずれ（強化）
        const offsetX = (Math.random() - 0.5) * fontSize * 0.15;
        const offsetY = (Math.random() - 0.5) * fontSize * 0.15;
        const rotation = (Math.random() - 0.5) * 0.1; // ±5度

        // 位置に基づくインクムラ
        const normalizedX = charIndex / Math.max(1, lineChars.length - 1);
        const normalizedY = lineIndex / Math.max(1, lines.length - 1);
        const alpha = getInkAlpha(normalizedX, normalizedY);

        const x = firstCharCenterX + charIndex * fontSize + offsetX;
        const y = firstLineCenterY + lineIndex * horizontalLineHeight + offsetY;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);

        // 縁取り（白）
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        ctx.lineWidth = textStrokeWidth;
        ctx.strokeText(char, 0, 0);
        // 本体（選択色）
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        ctx.fillText(char, 0, 0);

        ctx.restore();
      });
    });
  }

  ctx.restore();
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
  arrangement: Arrangement
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
      if (arrangement === "neon") {
        drawNeonText(ctx, char, x, y, fontSize, textColor);
      } else {
        drawTextWithStroke(ctx, char, x, y, textColor, strokeColor, strokeWidth);
      }
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
  strokeWidth: number,
  arrangement: Arrangement
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
    // 文字の中心をmargin分内側に配置（文字の右端がwidth - marginになるように）
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
      const { char, isPunctuation } = charInfo;
      const baseY = startY + charIndex * lineHeight;

      // 句読点は右上に配置
      const charX = isPunctuation ? x + fontSize * 0.3 : x;
      const charY = isPunctuation ? baseY - fontSize * 0.3 : baseY;

      if (arrangement === "neon") {
        drawNeonText(ctx, char, charX, charY, fontSize, textColor);
      } else {
        drawTextWithStroke(ctx, char, charX, charY, textColor, strokeColor, strokeWidth);
      }
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
  // effort: 0-9 (default 4), 低いほど高速だが圧縮率が下がる
  // 大きな画像のエンコードが遅いため、effort: 2 で高速化
  if (format === "avif") {
    // 初回出力（quality 80, effort 2で高速化）
    let result = await image.avif({ quality: 80, effort: 2 }).toBuffer();

    // ファイルサイズがmaxFileSizeを超える場合は圧縮
    if (result.length > maxFileSize) {
      for (let quality = 70; quality >= 20; quality -= 10) {
        result = await sharp(imageBuffer)
          .resize(
            width > height ? Math.min(width, maxSize) : null,
            height >= width ? Math.min(height, maxSize) : null,
            { withoutEnlargement: true }
          )
          .avif({ quality, effort: 2 })
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
  arrangement,
  requestId,
}: ProcessImageParams): Promise<ProcessImageResult> {
  const startTime = Date.now();
  const inputSizeKB = Math.round(imageBuffer.length / 1024);
  const rid = requestId || "unknown";

  console.log(`[imageProcessor] rid=${rid} START: inputSize=${inputSizeKB}KB, output=${output}, position=${position}, font=${font}, arrangement=${arrangement}`);

  // EXIF Orientationに従って自動回転（回転後にOrientationタグは削除される）
  // sharpはHEIC/HEIFを直接読み込み可能（libheif経由）
  // rotate()後のメタデータを取得するため、一度バッファに変換してから再度読み込む
  //
  // iOSのJPEGはMPF（Multi-Picture Format）やDisplay P3カラースペースを含む場合があり、
  // sharpが処理できないことがある。まずsharpを試し、失敗したらjpeg-jsでフォールバック。
  let rotatedBuffer: Buffer;
  let usedFallback = false;
  try {
    rotatedBuffer = await sharp(imageBuffer).rotate().toBuffer();
  } catch (sharpError) {
    // sharpが失敗した場合、JPEGならjpeg-jsでクリーンアップを試みる
    const magic = imageBuffer.subarray(0, 2).toString('hex');
    const isJpeg = magic === 'ffd8';
    if (!isJpeg) {
      console.error(`[imageProcessor] rid=${rid} SHARP_FAILED (non-JPEG):`, sharpError);
      throw new ImageProcessError("画像の読み込みに失敗しました", "rotate", rid);
    }
    console.log(`[imageProcessor] rid=${rid} SHARP_FAILED (JPEG), trying jpeg-js fallback. Error: ${sharpError instanceof Error ? sharpError.message : sharpError}`);
    try {
      // jpeg-jsで純粋なJavaScriptデコード（MPFやICCプロファイルを無視）
      const decodeStart = Date.now();
      const rawImageData = jpeg.decode(imageBuffer, { useTArray: true, tolerantDecoding: true });
      const decodeTime = Date.now() - decodeStart;
      // 再エンコード（quality 100でほぼ劣化なし）
      const encodeStart = Date.now();
      const reencoded = jpeg.encode(rawImageData, 100);
      const encodeTime = Date.now() - encodeStart;
      const cleanedBuffer = Buffer.from(reencoded.data);
      console.log(`[imageProcessor] rid=${rid} JPEG_JS_CLEANED: originalSize=${inputSizeKB}KB, cleanedSize=${Math.round(cleanedBuffer.length / 1024)}KB, decodeTime=${decodeTime}ms, encodeTime=${encodeTime}ms`);
      rotatedBuffer = await sharp(cleanedBuffer).rotate().toBuffer();
      usedFallback = true;
    } catch (jpegError) {
      console.error(`[imageProcessor] rid=${rid} JPEG_JS_FALLBACK_FAILED:`, jpegError);
      throw new ImageProcessError("画像の読み込みに失敗しました", "rotate", rid);
    }
  }
  if (usedFallback) {
    console.log(`[imageProcessor] rid=${rid} FALLBACK_SUCCESS: jpeg-js workaround applied`);
  }
  const rotateTime = Date.now() - startTime;
  const rotatedImage = sharp(rotatedBuffer);
  const metadata = await rotatedImage.metadata();

  const width = metadata.width || 800;
  const height = metadata.height || 600;

  console.log(`[imageProcessor] rid=${rid} ROTATE: ${rotateTime}ms, format=${metadata.format}, size=${width}x${height}`);

  const fontSize = calculateFontSize(width, height, position, size);
  const textColor = COLORS[color];
  const strokeColor = STROKE_COLORS[color];

  // Canvasでテキストオーバーレイを生成
  const textOverlayStart = Date.now();
  let textOverlay: Buffer;
  try {
    textOverlay = await createTextOverlay(
      width,
      height,
      text,
      position,
      fontSize,
      font,
      textColor,
      strokeColor,
      arrangement
    );
  } catch (error) {
    console.error(`[imageProcessor] rid=${rid} TEXT_OVERLAY_FAILED:`, error);
    throw new ImageProcessError("テキスト描画に失敗しました", "overlay", rid);
  }
  const textOverlayTime = Date.now() - textOverlayStart;

  console.log(`[imageProcessor] rid=${rid} TEXT_OVERLAY: ${textOverlayTime}ms, fontSize=${fontSize}`);

  // 画像にテキストを合成してJPEGで一時出力
  const compositeStart = Date.now();
  let composited: Buffer;
  try {
    composited = await rotatedImage
      .composite([
        {
          input: textOverlay,
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (error) {
    console.error(`[imageProcessor] rid=${rid} COMPOSITE_FAILED:`, error);
    throw new ImageProcessError("画像の合成に失敗しました", "composite", rid);
  }
  const compositeTime = Date.now() - compositeStart;

  console.log(`[imageProcessor] rid=${rid} COMPOSITE: ${compositeTime}ms, jpegSize=${Math.round(composited.length / 1024)}KB`);

  // 出力形式に応じて変換
  const outputStart = Date.now();
  let result: ProcessImageResult;
  try {
    result = await applyOutputFormat(composited, output);
  } catch (error) {
    console.error(`[imageProcessor] rid=${rid} OUTPUT_FORMAT_FAILED:`, error);
    throw new ImageProcessError("出力形式の変換に失敗しました", "convert", rid);
  }
  const outputTime = Date.now() - outputStart;

  const totalTime = Date.now() - startTime;
  console.log(`[imageProcessor] rid=${rid} OUTPUT_FORMAT: ${outputTime}ms, finalSize=${Math.round(result.buffer.length / 1024)}KB, type=${result.contentType}`);
  console.log(`[imageProcessor] rid=${rid} DONE: totalTime=${totalTime}ms`);

  return result;
}
