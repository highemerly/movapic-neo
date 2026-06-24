import sharp from "sharp";
import * as jpeg from "jpeg-js";
import { ImageProcessError } from "@/lib/errors";

/**
 * EXIF Orientationに従って画像を自動回転
 * iOSのJPEGはMPF（Multi-Picture Format）やDisplay P3カラースペースを含む場合があり、
 * sharpが処理できないことがある。まずsharpを試し、失敗したらjpeg-jsでフォールバック。
 */
export async function rotateImage(
  imageBuffer: Buffer,
  requestId: string
): Promise<{ buffer: Buffer; usedFallback: boolean }> {
  const inputSizeKB = Math.round(imageBuffer.length / 1024);

  try {
    // unlimited: HEIC/HEIF の libheif security limits(max_items=16等)を解除する
    // （環境変数では libvips に上書きされ効かない。詳細は CLAUDE.md「HEIC対応」）。
    const pipeline = sharp(imageBuffer, { unlimited: true }).rotate();
    const meta = await pipeline.metadata();
    // HEIC/HEIF(meta.format==="heif"・AVIF含む)はそのまま toBuffer すると HEIF で再エンコードされ
    // 重く(実測 約6倍)、後続でも HEIF 再デコードが必要になる。JPEG 化して後段へ渡す（最終出力は
    // AVIF/JPEG なので中間 JPEG95 の劣化は実用上無視できる）。非HEICは元フォーマット維持。
    const rotatedBuffer =
      meta.format === "heif"
        ? await pipeline.jpeg({ quality: 95 }).toBuffer()
        : await pipeline.toBuffer();
    return { buffer: rotatedBuffer, usedFallback: false };
  } catch (sharpError) {
    // sharpが失敗した場合、JPEGならjpeg-jsでクリーンアップを試みる
    const magic = imageBuffer.subarray(0, 2).toString("hex");
    const isJpeg = magic === "ffd8";

    if (!isJpeg) {
      console.error(
        `[rotate] rid=${requestId} SHARP_FAILED (non-JPEG):`,
        sharpError
      );
      throw new ImageProcessError("画像の読み込みに失敗しました", "rotate", requestId);
    }

    console.log(
      `[rotate] rid=${requestId} SHARP_FAILED (JPEG), trying jpeg-js fallback. Error: ${
        sharpError instanceof Error ? sharpError.message : sharpError
      }`
    );

    try {
      // jpeg-jsで純粋なJavaScriptデコード（MPFやICCプロファイルを無視）
      const decodeStart = Date.now();
      const rawImageData = jpeg.decode(imageBuffer, {
        useTArray: true,
        tolerantDecoding: true,
      });
      const decodeTime = Date.now() - decodeStart;

      // 再エンコード（quality 100でほぼ劣化なし）
      const encodeStart = Date.now();
      const reencoded = jpeg.encode(rawImageData, 100);
      const encodeTime = Date.now() - encodeStart;
      const cleanedBuffer = Buffer.from(reencoded.data);

      console.log(
        `[rotate] rid=${requestId} JPEG_JS_CLEANED: originalSize=${inputSizeKB}KB, cleanedSize=${Math.round(
          cleanedBuffer.length / 1024
        )}KB, decodeTime=${decodeTime}ms, encodeTime=${encodeTime}ms`
      );

      const rotatedBuffer = await sharp(cleanedBuffer).rotate().toBuffer();
      return { buffer: rotatedBuffer, usedFallback: true };
    } catch (jpegError) {
      console.error(
        `[rotate] rid=${requestId} JPEG_JS_FALLBACK_FAILED:`,
        jpegError
      );
      throw new ImageProcessError("画像の読み込みに失敗しました", "rotate", requestId);
    }
  }
}
