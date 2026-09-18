import sharp from "sharp";
import { AVIF_MAX_FILE_SIZE } from "@/types";

export interface ProcessImageResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
  originalWidth?: number;
  originalHeight?: number;
}

/** Fediverse へ送るための JPEG 変換品質。合成直後の中間 JPEG（imageProcessor）と同値。 */
const UPLOAD_JPEG_QUALITY = 90;

/**
 * 生成画像を AVIF へ変換する。
 * リサイズはimageProcessor.tsで事前に行われるため、ここでは行わない。
 *
 * 連携先（OutputFormat）で形式を変えないのは、SHAMEZO が保存・表示する画像を
 * 例外なく AVIF に揃えるため。Mastodon は AVIF を受け取れないが、それは投稿直前の
 * 変換で解決する（src/lib/fediverse/uploadFormat.ts）。
 */
export async function applyOutputFormat(
  imageBuffer: Buffer
): Promise<ProcessImageResult> {
  // effort: 0-9 (default 4), 低いほど高速だが圧縮率が下がる
  // effort: 2 で高速化しつつ圧縮効率を維持
  let result = await sharp(imageBuffer).avif({ quality: 80, effort: 2 }).toBuffer();

  // ファイルサイズが上限を超える場合は品質を下げて再エンコード
  if (result.length > AVIF_MAX_FILE_SIZE) {
    for (let quality = 70; quality >= 20; quality -= 10) {
      result = await sharp(imageBuffer).avif({ quality, effort: 2 }).toBuffer();

      if (result.length <= AVIF_MAX_FILE_SIZE) {
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

/**
 * 保存済みの生成画像（AVIF）を JPEG へ変換する。Mastodon へのアップロード専用。
 *
 * SHAMEZO 側の保存物は AVIF のままなので、ここでの変換結果はどこにも保存しない
 * （投稿のたびに作り直す＝保存物と連合先の形式を混ぜない）。
 */
export async function toUploadJpeg(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer).jpeg({ quality: UPLOAD_JPEG_QUALITY }).toBuffer();
}
