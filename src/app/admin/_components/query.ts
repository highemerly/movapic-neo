/**
 * admin 各ページのページネーション/ソート/期間切替は searchParams で完結する
 * （全 admin ページは force-dynamic のサーバーコンポーネント）。href 生成をここに集約する。
 */

/** テーブル系ページの1ページ件数 */
export const PAGE_SIZE = 50;

type ParamValue = string | number | undefined | null;

/**
 * 現在の searchParams に overrides をマージして href を作る。
 * undefined / null / 空文字の値はクエリから落とす（既定値を URL に残さずクリーンに保つ）。
 */
export function withParams(
  basePath: string,
  current: Record<string, string | undefined>,
  overrides: Record<string, ParamValue>
): string {
  const merged: Record<string, ParamValue> = { ...current, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** searchParams（string|string[]）を単一 string の record に正規化する */
export function normalizeParams(
  sp: Record<string, string | string[] | undefined>
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    out[k] = Array.isArray(v) ? v[0] : v;
  }
  return out;
}

/** 1始まりの page を安全にパースする（不正・0以下は 1） */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
