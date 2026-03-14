import sharp from "sharp";
import { OutputFormat, OUTPUT_CONFIG } from "@/types";

export interface ProcessImageResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/**
 * 出力形式に応じてリサイズ・圧縮・フォーマット変換を適用
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
