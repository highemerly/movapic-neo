import sharp from "sharp";
import {
  Position,
  Color,
  Size,
  FontFamily,
  OutputFormat,
  Arrangement,
  COLORS,
  STROKE_COLORS,
} from "@/types";
import { ImageProcessError } from "@/lib/errors";
import {
  rotateImage,
  applyOutputFormat,
  createTextOverlay,
  calculateFontSize,
  ProcessImageResult,
} from "@/lib/image";

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

export type { ProcessImageResult };

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

  console.log(
    `[imageProcessor] rid=${rid} START: inputSize=${inputSizeKB}KB, output=${output}, position=${position}, font=${font}, arrangement=${arrangement}`
  );

  // EXIF Orientationに従って自動回転
  const rotateStart = Date.now();
  const { buffer: rotatedBuffer, usedFallback } = await rotateImage(imageBuffer, rid);

  if (usedFallback) {
    console.log(`[imageProcessor] rid=${rid} FALLBACK_SUCCESS: jpeg-js workaround applied`);
  }

  const rotateTime = Date.now() - rotateStart;
  const rotatedImage = sharp(rotatedBuffer);
  const metadata = await rotatedImage.metadata();

  const width = metadata.width || 800;
  const height = metadata.height || 600;

  console.log(
    `[imageProcessor] rid=${rid} ROTATE: ${rotateTime}ms, format=${metadata.format}, size=${width}x${height}`
  );

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

  console.log(
    `[imageProcessor] rid=${rid} COMPOSITE: ${compositeTime}ms, jpegSize=${Math.round(
      composited.length / 1024
    )}KB`
  );

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
  console.log(
    `[imageProcessor] rid=${rid} OUTPUT_FORMAT: ${outputTime}ms, finalSize=${Math.round(
      result.buffer.length / 1024
    )}KB, type=${result.contentType}`
  );
  console.log(`[imageProcessor] rid=${rid} DONE: totalTime=${totalTime}ms`);

  return result;
}
