/**
 * 入力画像のデコード上限（画素数）。形式ごとに分ける。
 *
 * デコード時のメモリは画素数だけでなく形式で大きく変わるため、一律の上限では守れない。
 * 本番同等（Alpine libvips 8.18.2 / libheif 1.23・2CPU・メモリ上限 1536Mi）で
 * generate と同じ処理（rotate → 2048px 縮小）のピークを実測した（2026-10-15）:
 *  - JPEG 196MP=631MB / PNG 196MP=142MB（縮小読み込み・逐次処理が効く）
 *  - AVIF(HEIF) 約12.6MB/MP: 64MP=811MB / 80MP=1002MB / 100MP=1261MB / 144MP=OOM Kill
 *  - WebP 約7.9MB/MP: 80MP=644MB / 144MP=1128MB
 * pitfall: 以前は全形式 200MP 一律（「RGB で ~600MB」想定）で、196MP・2KB の AVIF 1枚で
 * compute が OOM Kill された（/api/v1/generate は未認証で叩ける）。
 *
 * 80MP は、compute の常駐分と同時に来た通常写真（12MP≈180MB）を差し引いても上限に収まる値。
 * iPhone の 48MP HEIC は通る。
 */

/**
 * 受け付ける入力形式（sharp の metadata().format＝中身から判定した値）。HEIC と AVIF はどちらも "heif"。
 * 入口（generate・メール）の形式チェックはクライアント申告の MIME / 拡張子しか見られないため、
 * ここで実際の形式を確かめる。pitfall: 以前は申告を偽れば libvips が読める形式は何でも通り、
 * 130KB の 196MP GIF（image/jpeg と申告）1枚で compute が OOM Kill された。
 */
const SUPPORTED_INPUT_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp", "heif"]);

export function isSupportedInputFormat(format: string | undefined): boolean {
  return format !== undefined && SUPPORTED_INPUT_FORMATS.has(format);
}

/** JPEG / PNG の上限（200MP 機の実写真を通す） */
export const MAX_DECODE_PIXELS = 200_000_000;

/** HEIF（HEIC / AVIF）・WebP の上限 */
export const MAX_DECODE_PIXELS_HEAVY = 80_000_000;

/** sharp の metadata().format ごとの上限（format は中身から判定された値＝クライアント申告ではない） */
export function maxDecodePixels(format: string | undefined): number {
  return format === "heif" || format === "webp"
    ? MAX_DECODE_PIXELS_HEAVY
    : MAX_DECODE_PIXELS;
}

export function exceedsDecodePixelLimit(meta: {
  format?: string;
  width?: number;
  height?: number;
}): boolean {
  return (meta.width ?? 0) * (meta.height ?? 0) > maxDecodePixels(meta.format);
}

/**
 * 文字入れ後の出力の長辺上限（imageProcessor がこの値まで事前縮小する）。
 * finalize（投稿時の保存前チェック）が受け取る正規の画像は必ずこれ以下＝超えていれば
 * /api/v1/post を直接叩いて送られた画像。縮小する側と確かめる側でこの値を共有する。
 */
export const MAX_OUTPUT_EDGE = 2048;

export function exceedsOutputEdge(meta: { width?: number; height?: number }): boolean {
  return Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_OUTPUT_EDGE;
}
