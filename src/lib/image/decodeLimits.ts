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
 * 80MP は 1枚なら上限に収まる値（iPhone の 48MP HEIC は通る）。同時に来た分は decodeBudget が
 * メモリ予算で待たせる（上限は1枚ごとの天井、予算は同時処理の合計を守る）。
 * pitfall: 以前は「重い画像は同時に1枚」前提で上限だけを決めていたため、未認証の generate に
 * 79MP・2KB の AVIF を2枚同時に送るだけで compute が OOM Kill された（2026-11-10 再現）。
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
 * 1リクエストの文字入れ全体（rotate → 2048px 縮小 → 文字描画 → 出力変換）で増えるメモリの
 * 見積もり（MB）。decodeBudget が同時に処理する分の合計をこれで数える。
 * 本番同等（Alpine libvips・メモリ上限 1536Mi）で、常駐（初回処理後 約220MB）を除いた1件あたりの
 * 増分を実測した（2026-11-10。上の 2026-10-15 の値は常駐込みのピークなので係数には使えない）:
 *  - AVIF 12MP=+172MB / 48MP=+566MB / 79MP=+907MB（傾き 約11MB/MP）
 *  - JPEG 12MP（実写相当のノイズ・8.6MB）=+172MB / 190MP（ベタ塗り）=+500MB
 *  - WebP 79MP=+544MB / PNG 190MP=+128MB
 * 固定分は入力バッファの複製・文字描画・出力変換など画素数によらない分。どの実測も下回らない
 * ように取ってある（見積もり不足は OOM、過大は待ちが少し増えるだけのため。テストで実測値と突き合わせる）。
 */
const REQUEST_BASE_MB = 150;
const MB_PER_MEGAPIXEL: Readonly<Record<string, number>> = {
  heif: 11,
  webp: 7,
  jpeg: 2.5,
  png: 0.5,
};
/**
 * 形式や寸法が読めないときの見積もり。この場合 rotate は壊れた JPEG として jpeg-js へ回すため、
 * その既定の上限 maxMemoryUsageInMB:512 を使う（それ以外の形式は rotate が即座に弾く）。
 */
const UNKNOWN_INPUT_MB = 512;

/**
 * @param meta ヘッダ（sharp の metadata()）。読めなかったときは undefined。
 * @returns 見積もり（MB）。rotate がヘッダの時点で弾く入力（対応外の形式・画素数超過）は展開しないので 0。
 *   0 を予算に数えると、弾くだけの入力で他のリクエストを待たせてしまう。
 */
export function estimateDecodeMB(
  meta: { format?: string; width?: number; height?: number } | undefined
): number {
  if (meta === undefined) return REQUEST_BASE_MB + UNKNOWN_INPUT_MB;
  if (!isSupportedInputFormat(meta.format) || exceedsDecodePixelLimit(meta)) return 0;
  const perMegapixel = MB_PER_MEGAPIXEL[meta.format as string];
  if (perMegapixel === undefined || !meta.width || !meta.height) {
    return REQUEST_BASE_MB + UNKNOWN_INPUT_MB;
  }
  return Math.ceil(REQUEST_BASE_MB + ((meta.width * meta.height) / 1_000_000) * perMegapixel);
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
