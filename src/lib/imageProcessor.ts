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
import { getSeasonByKey } from "@/lib/seasons/catalog";

interface ProcessImageParams {
  imageBuffer: Buffer;
  text: string;
  position: Position;
  color: Color;
  size: Size;
  font: FontFamily;
  output: OutputFormat;
  arrangement: Arrangement;
  /** シーズン（期間限定）キー。セット時は position/color/size/font/arrangement を無視しプリセットで描画 */
  season?: string | null;
  requestId?: string;
}

export type { ProcessImageResult };

// 処理用の最大サイズ（事前リサイズ）
// 最終出力が2048pxなので、それに合わせて事前に縮小することで後続処理を高速化
const MAX_PROCESSING_SIZE = 2048;

export async function processImage({
  imageBuffer,
  text,
  position,
  color,
  size,
  font,
  output,
  arrangement,
  season,
  requestId,
}: ProcessImageParams): Promise<ProcessImageResult> {
  const startTime = Date.now();
  const inputSizeKB = Math.round(imageBuffer.length / 1024);
  const rid = requestId || "unknown";

  // シーズン指定時は通常オプションをプリセットへ上書きし、arrangement は無効化する。
  // 描画分岐は createTextOverlay が season を受けて行う（短冊背景など）。
  const seasonDef = season ? getSeasonByKey(season) : undefined;
  const effPosition = seasonDef ? seasonDef.preset.position : position;
  const effColor = seasonDef ? seasonDef.preset.color : color;
  const effSize = seasonDef ? seasonDef.preset.size : size;
  const effFont = seasonDef ? seasonDef.preset.font : font;
  const effArrangement: Arrangement = seasonDef ? "none" : arrangement;

  console.log(
    `[imageProcessor] rid=${rid} START: inputSize=${inputSizeKB}KB, output=${output}, position=${effPosition}, font=${effFont}, arrangement=${effArrangement}, season=${season ?? "none"}`
  );

  // EXIF Orientationに従って自動回転
  const rotateStart = Date.now();
  const { buffer: rotatedBuffer, usedFallback } = await rotateImage(imageBuffer, rid);

  if (usedFallback) {
    console.log(`[imageProcessor] rid=${rid} FALLBACK_SUCCESS: jpeg-js workaround applied`);
  }

  const rotateTime = Date.now() - rotateStart;
  // rotate が HEIC/HEIF を JPEG 化して返すため、ここに来る rotatedBuffer は非HEIF（unlimited不要）。
  let processedImage = sharp(rotatedBuffer);
  const originalMetadata = await processedImage.metadata();

  const originalWidth = originalMetadata.width || 800;
  const originalHeight = originalMetadata.height || 600;

  console.log(
    `[imageProcessor] rid=${rid} ROTATE: ${rotateTime}ms, format=${originalMetadata.format}, size=${originalWidth}x${originalHeight}`
  );

  // 事前リサイズ: 長辺がMAX_PROCESSING_SIZEを超える場合は縮小
  // テキスト描画・合成・出力変換の全工程が高速化される
  let width = originalWidth;
  let height = originalHeight;

  if (originalWidth > MAX_PROCESSING_SIZE || originalHeight > MAX_PROCESSING_SIZE) {
    const resizeStart = Date.now();

    try {
      if (originalWidth > originalHeight) {
        processedImage = processedImage.resize(MAX_PROCESSING_SIZE, null, {
          withoutEnlargement: true,
        });
        width = MAX_PROCESSING_SIZE;
        height = Math.round(originalHeight * (MAX_PROCESSING_SIZE / originalWidth));
      } else {
        processedImage = processedImage.resize(null, MAX_PROCESSING_SIZE, {
          withoutEnlargement: true,
        });
        height = MAX_PROCESSING_SIZE;
        width = Math.round(originalWidth * (MAX_PROCESSING_SIZE / originalHeight));
      }

      // リサイズを適用してバッファを取得
      const resizedBuffer = await processedImage.toBuffer();
      processedImage = sharp(resizedBuffer);

      const resizeTime = Date.now() - resizeStart;
      console.log(
        `[imageProcessor] rid=${rid} PRE_RESIZE: ${resizeTime}ms, ${originalWidth}x${originalHeight} -> ${width}x${height}`
      );
    } catch (error) {
      console.error(`[imageProcessor] rid=${rid} PRE_RESIZE_FAILED:`, error);
      throw new ImageProcessError("画像のリサイズに失敗しました", "resize", rid);
    }
  }

  const fontSize = calculateFontSize(width, height, effPosition, effSize);
  // シーズンが描画専用の色（hex）を指定していればそれを使う（例: 七夕の黒文字・縁取りなし）。
  const textColor = seasonDef?.preset.textColorHex ?? COLORS[effColor];
  const strokeColor = seasonDef?.preset.strokeColorHex ?? STROKE_COLORS[effColor];

  // Canvasでテキストオーバーレイを生成
  const textOverlayStart = Date.now();
  let textOverlay: Buffer;
  try {
    textOverlay = await createTextOverlay(
      width,
      height,
      text,
      effPosition,
      fontSize,
      effFont,
      textColor,
      strokeColor,
      effArrangement,
      season
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
    composited = await processedImage
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

  return {
    ...result,
    originalWidth,
    originalHeight,
  };
}
