/**
 * お気に入りキャッシュの「いつ Fediverse サーバーへ取りに行くか」を決める純粋ロジック。
 *
 * 副作用なし・I/Oなし（テスト容易性のため now を引数で受ける）。判定は2系統:
 * - GET（画像詳細ページ）: shouldSyncOnGet() … TTL 切れかどうか
 * - 定期ジョブ（フォールバック）: isFavoriteSyncDue() … fire1/fire2 の発火条件
 *
 * 両者は「14日マーク以降の成功syncが入ったら止まる」点で歩調を合わせている。
 */

export const MIN_MS = 60_000;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;

/** 成熟と見なす日数。これを過ぎたらfav数はほぼ動かないので最終syncを1回だけ行い停止する */
export const MATURE_DAYS = 14;

/** フォールバックsyncの対象になる最小経過日数（投稿が落ち着く目安） */
export const FALLBACK_MIN_AGE_MS = 1 * DAY_MS;
/**
 * フォールバックsyncを恒久停止する経過日数。これを超えたら成功・失敗を問わず
 * 定期リトライしない（fav はほぼ動かず、失敗し続ける投稿を無限に叩かないための上限）。
 */
export const FALLBACK_MAX_AGE_MS = 16 * DAY_MS;
/** フォールバックsyncの通常バックオフ（成功・未失敗時の再試行間隔） */
export const FALLBACK_BACKOFF_MS = 12 * HOUR_MS;
/**
 * 一時障害（429 / 5xx / 接続失敗＝0）だったときのバックオフ。回復を待って再試行する。
 * ※ 429以外の4xx（404 deleted / 403 forbidden 等）は回復見込みが薄いため、バックオフではなく
 *   isFavoriteSyncDue 側で定期リトライ自体を停止する（このバックオフは適用しない）。
 */
export const FALLBACK_BACKOFF_FAILED_MS = 1 * DAY_MS;

/**
 * 「createdAt + markDays 日 以降に成功（200）syncが記録されているか」。
 * fire1（mark=1日）/ fire2（mark=14日）/ GETのInfinity判定 で共通に使う停止条件。
 */
function hasSuccessfulSyncAfter(
  createdAt: Date,
  postStatus: number | null,
  favoritesSyncedAt: Date | null,
  markDays: number
): boolean {
  if (postStatus !== 200 || !favoritesSyncedAt) return false;
  return favoritesSyncedAt.getTime() >= createdAt.getTime() + markDays * DAY_MS;
}

/**
 * GETキャッシュのTTL（ms）を算出する。Infinity=停止 / 0=即stale。
 * - 4xx（429除く）: 1日（削除確定・権限不足など、頻繁に再試行する意味が薄い）
 * - 429 / 5xx / 0(接続失敗): 1時間（レート制限・一時障害。少し置いて再試行）
 * - 200 / null: 投稿経過時間ベース。
 *   14日超は「成熟後（createdAt+14日 以降）の成功syncが既にあれば Infinity＝停止」。
 *   まだ無ければ 0（=即stale）を返し、次のGETで最終syncを1回だけ走らせる。
 *   ※ 年齢だけで停止すると、若い頃のsyncしか無い古い投稿を開いたとき古い値が出続ける。
 */
export function computeCacheTtl(
  createdAt: Date,
  postStatus: number | null,
  favoritesSyncedAt: Date | null,
  now: number
): number {
  if (postStatus !== null) {
    if (postStatus === 429 || postStatus === 0 || (postStatus >= 500 && postStatus < 600))
      return HOUR_MS;
    if (postStatus >= 400 && postStatus < 500) return DAY_MS;
  }
  const age = now - createdAt.getTime();
  if (age <= 5 * MIN_MS) return 1 * MIN_MS;
  if (age <= 1 * HOUR_MS) return 5 * MIN_MS;
  if (age <= 3 * HOUR_MS) return 10 * MIN_MS;
  if (age <= 1 * DAY_MS) return 1 * HOUR_MS;
  if (age <= MATURE_DAYS * DAY_MS) return 1 * DAY_MS;
  return hasSuccessfulSyncAfter(createdAt, postStatus, favoritesSyncedAt, MATURE_DAYS)
    ? Infinity
    : 0;
}

/**
 * GET時にFediverseサーバーへ取りに行くべきか（TTL切れ＝stale か）。
 * 未sync（favoritesSyncedAt=null）は常に true。
 */
export function shouldSyncOnGet(
  createdAt: Date,
  postStatus: number | null,
  favoritesSyncedAt: Date | null,
  now: number = Date.now()
): boolean {
  if (!favoritesSyncedAt) return true;
  const ttl = computeCacheTtl(createdAt, postStatus, favoritesSyncedAt, now);
  return now - favoritesSyncedAt.getTime() > ttl;
}

/**
 * 今回の成功 sync が「その投稿で初めての成功 sync」か（＝通知はベースライン化のみで作らない）。
 *
 * favoritesSyncedAt は失敗時にも更新される（TTL/バックオフのため）ので、それだけを見ると
 * 「失敗 → 初めての成功」のときに初回と判定されず、既存お気に入り全員へ通知が誤爆する。
 * 成功実績は次のいずれかで判定する（失敗はキャッシュを触らないため両者は成功時のみ立つ）:
 * - postStatus === 200（直近の sync が成功）
 * - 既存キャッシュが非空（過去の成功が上位40件を populate 済み）
 *
 * @param postStatus         更新前の Image.postStatus
 * @param cachedFavoriterCount 更新前の favoritersCache 件数
 */
export function isFirstSuccessfulSync(
  postStatus: number | null,
  cachedFavoriterCount: number
): boolean {
  const hadSuccessfulSync = postStatus === 200 || cachedFavoriterCount > 0;
  return !hadSuccessfulSync;
}

export interface FavoriteSyncRow {
  createdAt: Date;
  favoritesSyncedAt: Date | null;
  postStatus: number | null;
}

/** 429を除く4xx（404 deleted / 403 forbidden 等、回復見込みが薄い恒久エラー）か。 */
function isPermanentClientError(postStatus: number | null): boolean {
  return postStatus !== null && postStatus !== 429 && postStatus >= 400 && postStatus < 500;
}

/**
 * 定期フォールバックsyncの発火条件（worker SQL の WHERE と一致させること）。
 *
 * 足切り（この順に評価）:
 *   1. 投稿から1日未満 → 対象外（まだ動きが激しい時期は GET 側に任せる）。
 *   2. 投稿から16日超 → 恒久停止（fav はほぼ動かず、失敗し続ける投稿を無限に叩かない）。
 *   3. 直近が「429以外の4xx」（deleted/forbidden 等）→ 定期リトライしない（回復見込みが薄い）。
 *   4. バックオフ未経過 → 対象外。バックオフは直近syncの結果で変える:
 *      成功(200)/未sync=12時間、一時障害(429/5xx/0)=1日。
 * その上で fire1 / fire2 のどちらかが立てば発火:
 *   - fire1: 1日経過後にまだ成功syncが無い（投稿が落ち着いた頃のfavを1回拾う）
 *   - fire2: 14日経過後にまだ「14日以降の成功sync」が無い（成熟後の最終syncを1回拾い停止）
 * 成功（200）syncがその段のマークを越えると、その段は二度と発火しない。
 * 一時障害（429/5xx/0）は postStatus≠200 のままなので、成功するか16日を超えるまで1日間隔で再試行される。
 */
export function isFavoriteSyncDue(
  row: FavoriteSyncRow,
  now: number = Date.now()
): boolean {
  const age = now - row.createdAt.getTime();
  if (age < FALLBACK_MIN_AGE_MS) return false;
  // 16日超は恒久停止（成功/失敗を問わずリトライしない）
  if (age >= FALLBACK_MAX_AGE_MS) return false;
  // 429以外の4xx（deleted/forbidden 等）は回復見込みが薄いので定期リトライしない
  if (isPermanentClientError(row.postStatus)) return false;

  const syncedMs = row.favoritesSyncedAt?.getTime() ?? null;
  // ここに来る失敗は一時障害（429/5xx/0）のみ（恒久4xxは上で除外済み）。1日バックオフで再試行。
  const lastFailed = row.postStatus !== null && row.postStatus !== 200;
  const backoffMs = lastFailed ? FALLBACK_BACKOFF_FAILED_MS : FALLBACK_BACKOFF_MS;
  const backoffOk = syncedMs === null || syncedMs <= now - backoffMs;
  if (!backoffOk) return false;

  const fire1 = !hasSuccessfulSyncAfter(
    row.createdAt,
    row.postStatus,
    row.favoritesSyncedAt,
    1
  );
  const fire2 =
    age >= MATURE_DAYS * DAY_MS &&
    !hasSuccessfulSyncAfter(row.createdAt, row.postStatus, row.favoritesSyncedAt, MATURE_DAYS);

  return fire1 || fire2;
}
