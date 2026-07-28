/**
 * お気に入り／リアクション通知から、閲覧者がミュートしている相手を取り除く純粋関数。
 *
 * ミュートは「自分の視界から隠す」ため、表示相手を消すだけでなく総数もその分だけ減らす。
 * 連合の総数（count）には含まれるが表示用リストに載っていないミュート相手は acct で識別
 * できず件数を減らせない＝識別できた分だけ隠す。表示相手も総数も尽きた（＝この通知は
 * 完全にミュート相手のみ）なら null を返し、呼び出し側で通知ごと隠す。
 */

export function filterFavoriteFeedByMuted<T extends { acct: string }>(
  fav: { count: number; favoriters: T[] },
  mutedAccts: ReadonlySet<string>
): { count: number; favoriters: T[] } | null {
  if (mutedAccts.size === 0) return fav;

  const favoriters = fav.favoriters.filter((f) => !mutedAccts.has(f.acct));
  const removed = fav.favoriters.length - favoriters.length;
  if (removed === 0) return fav;

  const count = Math.max(0, fav.count - removed);
  if (count === 0 && favoriters.length === 0) return null;
  return { count, favoriters };
}
