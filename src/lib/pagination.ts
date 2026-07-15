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
 * クエリの limit パラメータを 1〜maxLimit の範囲に正規化する。
 * 未指定・数値化できない値（例 "abc"）は defaultLimit にフォールバックする。
 * ※ Number.isNaN ガードが無いと ?limit=abc で parseInt→NaN が Math.max/min を素通りし、
 *   cursorPageArgs の take: NaN で Prisma クエリが壊れる。
 */
export function parsePageLimit(
  limitParam: string | null,
  {
    defaultLimit = DEFAULT_PAGE_LIMIT,
    maxLimit = MAX_PAGE_LIMIT,
  }: { defaultLimit?: number; maxLimit?: number } = {}
): number {
  const parsed = parseInt(limitParam ?? "", 10);
  const limit = Number.isNaN(parsed) ? defaultLimit : parsed;
  return Math.min(Math.max(1, limit), maxLimit);
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

/**
 * 差分ロード（since）用の切り出し。
 *
 * id は UUID で時系列ソート不可のため、「since より新しい行」は通常の降順カーソルでは
 * 表現できない。呼び出し側で昇順（createdAt asc, id asc）＋ cursorPageArgs(since, limit)
 * として取得し（since 自身は skip・gap 判定のため limit+1 件）、その昇順結果をこの関数で
 * 表示順（新しい順）へ反転する。
 *
 * gap=true は新着が 1 ページを超え、先頭に prepend すると穴が空くことを表す。この場合は
 * 呼び出し側（クライアント）が差分 prepend をやめて全差し替えにフォールバックする前提で、
 * 返す items 自体は使われない（先頭 limit 件のみ返す）。
 */
export function sliceSincePage<T extends { id: string }>(
  items: T[],
  limit: number
): { result: T[]; gap: boolean } {
  const gap = items.length > limit;
  const page = gap ? items.slice(0, limit) : items;
  return { result: page.slice().reverse(), gap };
}

/**
 * 更新（再前面化/復元）時に、最新ページ（サーバ真実）で表示中一覧の head を作り直す。
 *
 * 単純な prepend（新着追加のみ）では削除・非公開・編集が既存表示に残り続けるため、最新
 * ページに入る時間窓を新鮮な結果で置き換える。窓より古い tail は残してスクロール位置・
 * 読み込み済みを保つ。prev / incoming はどちらもフィルタ（ミュート除外）適用済みを渡す前提。
 *
 * - prev が空 or ページが全件（!hasMore）: tail を残さず incoming で作り直す（窓より古い位置に
 *   居座る削除済み要素を防ぐ）。cursor は incoming 基準へ更新。
 * - 重なりあり: incoming（head）＋ 重なり位置より古い tail。tail の最古は不変なので cursor 据え置き。
 * - 重なり無し（新着が1ページ超で穴あき）: tail を捨て incoming で全差し替え。cursor は incoming 基準。
 *
 * keepCursor=true のとき呼び出し側は nextCursor を変更しない（tail 末尾が不変のため）。
 * newIds は「今まで表示に無かった＝新規」要素の id（入場アニメ用）。
 */
export function reconcileTimeline<T extends { id: string }>(
  prev: T[],
  incoming: T[],
  hasMore: boolean,
  nextCursor: string | null
): { images: T[]; cursor: string | null; keepCursor: boolean; newIds: Set<string> } {
  const freshIds = new Set(incoming.map((img) => img.id));
  const prevIds = new Set(prev.map((img) => img.id));
  const newIds = new Set(
    incoming.filter((img) => !prevIds.has(img.id)).map((img) => img.id)
  );
  const freshCursor = hasMore ? nextCursor : null;

  if (prev.length === 0 || !hasMore) {
    return { images: incoming, cursor: freshCursor, keepCursor: false, newIds };
  }

  // prev 側で最新ページと重なる最古の位置を探す。そこより後ろ（古い）を tail として残す。
  let cut = -1;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (freshIds.has(prev[i].id)) {
      cut = i;
      break;
    }
  }
  if (cut === -1) {
    return { images: incoming, cursor: freshCursor, keepCursor: false, newIds };
  }

  const tail = prev.slice(cut + 1).filter((img) => !freshIds.has(img.id));
  return { images: [...incoming, ...tail], cursor: null, keepCursor: true, newIds };
}
