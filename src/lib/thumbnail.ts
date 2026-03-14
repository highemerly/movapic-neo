/**
 * サムネイル生成ロジック
 * カレンダー表示用の64x64pxサムネイルを生成
 */

import sharp from "sharp";
import { Position } from "@/types";

const THUMBNAIL_SIZE = 64;
const THUMBNAIL_QUALITY = 60;

/**
 * 文字位置に応じたクロップ位置を決定
 * - top / left → 左上から
 * - bottom → 左下から
 * - right → 右上から
 */
function getCropPosition(
  position: Position,
  width: number,
  height: number,
  size: number
): { left: number; top: number } {
  switch (position) {
    case "bottom":
      return {
        left: 0,
        top: Math.max(0, height - size),
      };
    case "right":
      return {
        left: Math.max(0, width - size),
        top: 0,
      };
    case "top":
    case "left":
    default:
      return {
        left: 0,
        top: 0,
      };
  }
}

/**
 * サムネイル画像を生成
 * @param imageBuffer 元画像のBuffer
 * @param position 文字の位置（クロップ位置決定に使用）
 * @returns WebP形式の100x100pxサムネイル
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  position: Position
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || THUMBNAIL_SIZE;
  const height = metadata.height || THUMBNAIL_SIZE;

  // 正方形にクロップするためのサイズ（短辺に合わせる）
  const cropSize = Math.min(width, height);

  // 文字位置に応じたクロップ開始位置
  const { left, top } = getCropPosition(position, width, height, cropSize);

  // クロップ → リサイズ → WebP変換
  const thumbnail = await sharp(imageBuffer)
    .extract({
      left,
      top,
      width: cropSize,
      height: cropSize,
    })
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  return thumbnail;
}

/**
 * サムネイル用のストレージキーを生成
 * 元のストレージキーから派生させる
 * 例: 2025/03/14/uuid.jpg → 2025/03/14/uuid_thumb.webp
 */
export function generateThumbnailKey(storageKey: string): string {
  // 拡張子を除去して_thumb.webpを追加
  const lastDot = storageKey.lastIndexOf(".");
  const basePath = lastDot > 0 ? storageKey.substring(0, lastDot) : storageKey;
  return `${basePath}_thumb.webp`;
}
