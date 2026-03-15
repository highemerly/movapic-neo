import sharp from "sharp";
import { OutputFormat, OUTPUT_CONFIG } from "@/types";

export interface ProcessImageResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
  originalWidth?: number;
  originalHeight?: number;
}

/**
 * 出力形式に応じて圧縮・フォーマット変換を適用
 * リサイズはimageProcessor.tsで事前に行われるため、ここでは行わない
 */
export async function applyOutputFormat(
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

  const { maxFileSize, format } = config;

  // AVIF出力
  // effort: 0-9 (default 4), 低いほど高速だが圧縮率が下がる
  // effort: 2 で高速化しつつ圧縮効率を維持
  if (format === "avif") {
    // 初回出力（quality 80, effort 2で高速化）
    let result = await sharp(imageBuffer)
      .avif({ quality: 80, effort: 2 })
      .toBuffer();

    // ファイルサイズがmaxFileSizeを超える場合は品質を下げて再エンコード
    if (result.length > maxFileSize) {
      for (let quality = 70; quality >= 20; quality -= 10) {
        result = await sharp(imageBuffer)
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
