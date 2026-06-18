/**
 * カーソルベースのページネーション共通ヘルパー
 *
 * 各一覧 API（公開タイムライン / ユーザー画像 / お気に入り 等）で
 * 重複していた limit パース・cursor 引数・hasMore/nextCursor 算出を集約する。
 * id（文字列・降順）をカーソルに使う前提。
 */

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/**
 * クエリの limit パラメータを 1〜maxLimit の範囲に正規化する
 */
export function parsePageLimit(
  limitParam: string | null,
  {
    defaultLimit = DEFAULT_PAGE_LIMIT,
    maxLimit = MAX_PAGE_LIMIT,
  }: { defaultLimit?: number; maxLimit?: number } = {}
): number {
  return Math.min(
    Math.max(1, parseInt(limitParam || String(defaultLimit), 10)),
    maxLimit
  );
}

/**
 * Prisma findMany に展開する cursor 引数を返す。
 * hasMore 判定のため limit+1 件取得する（cursor 指定時は自身を skip）。
 */
export function cursorPageArgs(cursor: string | null, limit: number) {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/**
 * limit+1 件取得した結果を 1 ページ分に切り出し、次カーソルを算出する。
 */
export function slicePage<T extends { id: string }>(
  items: T[],
  limit: number
): { result: T[]; hasMore: boolean; nextCursor: string | null } {
  const hasMore = items.length > limit;
  const result = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore ? result[result.length - 1]?.id ?? null : null;
  return { result, hasMore, nextCursor };
}
