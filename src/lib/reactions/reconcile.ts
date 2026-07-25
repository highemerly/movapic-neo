/**
 * オーナーインスタンス側で「お気に入り／リアクションが取り消された」ことを検知し、
 * SHAMEZO の Reaction テーブルからも取り除く対象を割り出す純粋ロジック。
 *
 * 前提: SHAMEZO 上のリアクションは押した本人のトークンで Fediverse 側にも favourite/reaction
 * として送られている（src/lib/fediverse/favorite.ts）。よって「SHAMEZO には残っているが、
 * オーナーインスタンスのリアクション一覧には居ない acct」＝相手サーバー側で取り消された人、
 * と判定できる。
 *
 * 誤削除を避けるための2つの割り切り（ユーザー合意済み）:
 *  - 取得は上位40件まで。一覧が上限に達している回は「41件目以降に隠れているだけ」かを
 *    区別できないため、その回はまるごと判定を諦める（呼び出し側で早期 return）。
 *  - 付けた直後はまだオーナーインスタンスへ連合が伝播しておらず一覧に出ないことがある。
 *    作成から graceMs 未満のリアクションは対象外にする（付けた直後に消す事故を防ぐ）。
 *
 * 付け替え（❤→👍 など）は acct 自体は一覧に残るためここでは消えない（別概念として扱う）。
 */

export interface ReactionForReconcile {
  userId: string;
  /** username@domain 形式。オーナー一覧の acct と同じ規約で解決済み */
  acct: string;
  createdAt: Date;
}

/**
 * 取り消しとして削除すべき Reaction の userId を返す。
 * @param ownerAccts オーナーインスタンスの現在のリアクション一覧に載っている acct 集合
 * @param now        判定時刻
 * @param graceMs    連合の伝播を待つ猶予。これより新しいリアクションは対象外
 */
export function reactionsUnfavoritedOnOwner(params: {
  reactions: ReactionForReconcile[];
  ownerAccts: Set<string>;
  now: Date;
  graceMs: number;
}): string[] {
  const { reactions, ownerAccts, now, graceMs } = params;
  return reactions
    .filter((r) => now.getTime() - r.createdAt.getTime() >= graceMs)
    .filter((r) => !ownerAccts.has(r.acct))
    .map((r) => r.userId);
}
