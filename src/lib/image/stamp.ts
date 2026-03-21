import { CanvasRenderingContext2D } from "skia-canvas";
import { Position, FontFamily } from "@/types";
import {
  PROPORTIONAL_FONTS,
  ROTATE_CHARS,
  splitTextIntoLines,
  hexToRgb,
} from "./text";

/**
 * ハンコ効果で文字を描画
 * 斜め配置 + 枠線 + かすれ効果
 */
export function drawStampText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Position,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  textColor: string,
  fontName: string,
  fontFamily: FontFamily
): void {
  const chars = Array.from(text);
  const isVertical = position === "left" || position === "right";
  const rgb = hexToRgb(textColor);
  const useProportional = !isVertical && PROPORTIONAL_FONTS.has(fontFamily);

  // テキストの配置を計算
  let textWidth: number;
  let textHeight: number;
  let columns: string[][];
  let lines: string[];
  let lineWidths: number[] = [];

  // 縦書き/横書きで共通の行間・列幅
  const verticalLineHeight = fontSize * 1.2;
  const verticalColumnWidth = fontSize * 1.5;
  const horizontalLineHeight = fontSize * 1.4;

  if (isVertical) {
    // 縦書き: 列ごとに分割
    const maxHeight = height - margin * 2;
    const charsPerColumn = Math.max(
      1,
      Math.floor((maxHeight - margin * 2) / verticalLineHeight)
    );
    columns = [];
    for (let i = 0; i < chars.length; i += charsPerColumn) {
      columns.push(chars.slice(i, i + charsPerColumn));
    }
    textWidth = columns.length * verticalColumnWidth;
    const maxCharsInColumn = Math.min(chars.length, charsPerColumn);
    textHeight = maxCharsInColumn * verticalLineHeight;
    lines = [];
  } else {
    // 横書き: 行ごとに分割
    const maxWidth = width - margin * 2 - margin * 2;
    lines = splitTextIntoLines(ctx, text, maxWidth, useProportional, fontSize);

    if (useProportional) {
      lineWidths = lines.map((line) => ctx.measureText(line).width);
      textWidth = Math.max(...lineWidths, 0);
    } else {
      const maxCharsInLine = Math.max(...lines.map((l) => Array.from(l).length), 0);
      textWidth = maxCharsInLine * fontSize;
    }
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
    boxX = margin;
    boxY = margin;
  }

  const boxWidth = textWidth + padding * 2;
  const boxHeight = textHeight + padding * 2;

  // 中心を基準に回転
  const centerX = boxX + boxWidth / 2;
  const centerY = boxY + boxHeight / 2;
  const rotationAngle = -7.5 * (Math.PI / 180);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationAngle);
  ctx.translate(-centerX, -centerY);

  // 角丸の半径
  const cornerRadius = fontSize * 0.3;
  const wobbleAmount = fontSize * 0.1;

  // 背景色を描画（文字色の薄い版）
  ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
  ctx.fillRect(
    boxX - fontSize * 0.1,
    boxY - fontSize * 0.1,
    boxWidth + fontSize * 0.2,
    boxHeight + fontSize * 0.2
  );

  // 枠線を描画（手彫り風の歪んだ角丸枠）
  drawWobblyFrame(ctx, boxX, boxY, boxWidth, boxHeight, cornerRadius, wobbleAmount, fontSize, rgb);

  // フォント設定
  ctx.font = `${fontSize}px "${fontName}"`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // 文字の縁取り幅
  const textStrokeWidth = fontSize * 0.03;

  // インクのムラを生成
  const inkPatterns = generateInkPatterns();
  const getInkAlpha = createInkAlphaCalculator(inkPatterns);

  if (isVertical) {
    drawVerticalStampChars(
      ctx, columns, boxX, boxY, boxWidth, padding,
      verticalColumnWidth, verticalLineHeight, fontSize,
      textStrokeWidth, rgb, getInkAlpha
    );
  } else {
    drawHorizontalStampChars(
      ctx, lines, boxX, boxY, padding,
      horizontalLineHeight, fontSize, textStrokeWidth,
      rgb, useProportional, getInkAlpha
    );
  }

  ctx.restore();
}

function drawWobblyFrame(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
  cornerRadius: number,
  wobbleAmount: number,
  fontSize: number,
  rgb: { r: number; g: number; b: number }
): void {
  ctx.lineWidth = fontSize * 0.1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const segments = 4;

  ctx.beginPath();

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

  // 枠線を複数回描画してかすれ感を出す
  const frameStrokeWidth = fontSize * 0.02;
  for (let layer = 0; layer < 4; layer++) {
    const layerAlpha = 0.5 + Math.random() * 0.4;
    ctx.strokeStyle = `rgba(255, 255, 255, ${layerAlpha * 0.5})`;
    ctx.lineWidth = fontSize * 0.1 + frameStrokeWidth * 2;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${layerAlpha})`;
    ctx.lineWidth = fontSize * 0.1;
    ctx.stroke();
  }
}

interface InkPattern {
  x: number;
  y: number;
  intensity: number;
  radius: number;
}

function generateInkPatterns(): InkPattern[] {
  return [
    {
      x: Math.random(),
      y: Math.random(),
      intensity: Math.random() < 0.5 ? 0.2 : 0.9,
      radius: 0.3 + Math.random() * 0.3,
    },
    {
      x: Math.random(),
      y: Math.random(),
      intensity: Math.random() < 0.5 ? 0.3 : 1.0,
      radius: 0.2 + Math.random() * 0.3,
    },
    {
      x: Math.random(),
      y: Math.random(),
      intensity: Math.random() < 0.5 ? 0.15 : 0.85,
      radius: 0.25 + Math.random() * 0.25,
    },
    {
      x: Math.random(),
      y: Math.random(),
      intensity: Math.random() < 0.5 ? 0.25 : 0.95,
      radius: 0.2 + Math.random() * 0.2,
    },
  ];
}

function createInkAlphaCalculator(
  inkPatterns: InkPattern[]
): (normalizedX: number, normalizedY: number) => number {
  return (normalizedX: number, normalizedY: number): number => {
    let alpha = 0.85;

    for (const pattern of inkPatterns) {
      const dist = Math.sqrt(
        Math.pow(normalizedX - pattern.x, 2) + Math.pow(normalizedY - pattern.y, 2)
      );
      if (dist < pattern.radius) {
        const influence = 1 - dist / pattern.radius;
        alpha = alpha * (1 - influence * 0.5) + pattern.intensity * influence * 0.5;
      }
    }

    alpha += (Math.random() - 0.5) * 0.2;

    if (Math.random() < 0.03) {
      alpha *= 0.5;
    }

    return Math.max(0.4, Math.min(1.0, alpha));
  };
}

function drawVerticalStampChars(
  ctx: CanvasRenderingContext2D,
  columns: string[][],
  boxX: number,
  boxY: number,
  boxWidth: number,
  padding: number,
  columnWidth: number,
  lineHeight: number,
  fontSize: number,
  strokeWidth: number,
  rgb: { r: number; g: number; b: number },
  getInkAlpha: (x: number, y: number) => number
): void {
  const firstColumnCenterX = boxX + boxWidth - padding - columnWidth / 2;
  const firstCharCenterY = boxY + padding + lineHeight / 2;

  columns.forEach((column, colIndex) => {
    column.forEach((char, charIndex) => {
      const offsetX = (Math.random() - 0.5) * fontSize * 0.15;
      const offsetY = (Math.random() - 0.5) * fontSize * 0.15;
      const baseRotation = (Math.random() - 0.5) * 0.1;

      const normalizedX = colIndex / Math.max(1, columns.length - 1);
      const normalizedY = charIndex / Math.max(1, column.length - 1);
      const alpha = getInkAlpha(normalizedX, normalizedY);

      const shouldRotate = ROTATE_CHARS.has(char);
      const x = firstColumnCenterX - colIndex * columnWidth + offsetX;
      const y = firstCharCenterY + charIndex * lineHeight + offsetY;

      ctx.save();
      ctx.translate(x, y);
      // 縦書き用回転（括弧・長音記号など）+ かすれ用の微小回転
      ctx.rotate(baseRotation + (shouldRotate ? Math.PI / 2 : 0));

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(char, 0, 0);
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
      ctx.fillText(char, 0, 0);

      ctx.restore();
    });
  });
}

function drawHorizontalStampChars(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  boxX: number,
  boxY: number,
  padding: number,
  lineHeight: number,
  fontSize: number,
  strokeWidth: number,
  rgb: { r: number; g: number; b: number },
  useProportional: boolean,
  getInkAlpha: (x: number, y: number) => number
): void {
  const firstLineCenterY = boxY + padding + lineHeight / 2;

  lines.forEach((line, lineIndex) => {
    const lineChars = Array.from(line);
    const y = firstLineCenterY + lineIndex * lineHeight;

    if (useProportional) {
      let currentX = boxX + padding;
      lineChars.forEach((char, charIndex) => {
        const charWidth = ctx.measureText(char).width;
        const offsetX = (Math.random() - 0.5) * fontSize * 0.15;
        const offsetY = (Math.random() - 0.5) * fontSize * 0.15;
        const rotation = (Math.random() - 0.5) * 0.1;

        const normalizedX = charIndex / Math.max(1, lineChars.length - 1);
        const normalizedY = lineIndex / Math.max(1, lines.length - 1);
        const alpha = getInkAlpha(normalizedX, normalizedY);

        const x = currentX + charWidth / 2 + offsetX;

        ctx.save();
        ctx.translate(x, y + offsetY);
        ctx.rotate(rotation);

        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(char, 0, 0);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        ctx.fillText(char, 0, 0);

        ctx.restore();
        currentX += charWidth;
      });
    } else {
      const firstCharCenterX = boxX + padding + fontSize / 2;
      lineChars.forEach((char, charIndex) => {
        const offsetX = (Math.random() - 0.5) * fontSize * 0.15;
        const offsetY = (Math.random() - 0.5) * fontSize * 0.15;
        const rotation = (Math.random() - 0.5) * 0.1;

        const normalizedX = charIndex / Math.max(1, lineChars.length - 1);
        const normalizedY = lineIndex / Math.max(1, lines.length - 1);
        const alpha = getInkAlpha(normalizedX, normalizedY);

        const x = firstCharCenterX + charIndex * fontSize + offsetX;

        ctx.save();
        ctx.translate(x, y + offsetY);
        ctx.rotate(rotation);

        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(char, 0, 0);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        ctx.fillText(char, 0, 0);

        ctx.restore();
      });
    }
  });
}
