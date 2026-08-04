/**
 * 閲覧者自身のリアクション操作を、サーバーの応答を待たずに表示へ先に当てる純粋ロジック（楽観更新）。
 *
 * リアクションの書き込みは Fediverse への送信 → DB記録 → オーナー側キャッシュの同期、と外部への
 * 往復を伴うため応答が数百ms〜数秒かかる。押してから応答まで表示が変わらないと「反応していない」
 * ように見えるので、押した瞬間の見た目だけここで組み、確定値（APIレスポンス）が返ったら差し替える。
 *
 * 組み立ての規則は mergeReactions（merge.ts）と揃える（件数降順・同数は既存の並び順・
 * total はチップ件数の総和）。ズレると楽観表示と確定表示で並びが飛ぶため。
 */

import type { MergedReactions, ReactionChip, ReactionUser } from "./types";

/** 付け替え先。null は取り消し */
export interface ViewerReactionTarget {
  emoji: string;
  /** カスタム絵文字の画像URL（Unicode絵文字は null） */
  imageUrl: string | null;
}

/**
 * 閲覧者のリアクションを付け替え／取り消した後の表示状態を返す。
 * 1ユーザー1リアクションなので、既に付いているものは常に外してから足す。
 */
export function applyViewerReaction(
  current: MergedReactions,
  viewer: ReactionUser,
  next: ViewerReactionTarget | null
): MergedReactions {
  const chips: ReactionChip[] = current.chips.map((chip) => ({ ...chip }));
  const usersByEmoji = new Map<string, ReactionUser[]>(
    Object.entries(current.usersByEmoji).map(([emoji, users]) => [emoji, [...users]])
  );

  const previous = current.viewerEmoji;
  if (previous) {
    const chip = chips.find((c) => c.emoji === previous);
    if (chip) chip.count -= 1;
    usersByEmoji.set(
      previous,
      (usersByEmoji.get(previous) ?? []).filter((user) => user.acct !== viewer.acct)
    );
  }

  if (next) {
    const chip = chips.find((c) => c.emoji === next.emoji);
    if (chip) {
      chip.count += 1;
      // 既存チップに画像URLが無いのは Unicode 絵文字か未解決のとき。押した側が知っていれば埋める。
      if (!chip.imageUrl && next.imageUrl) chip.imageUrl = next.imageUrl;
    } else {
      chips.push({ emoji: next.emoji, imageUrl: next.imageUrl, count: 1, reactedByViewer: true });
    }
    // 自分は「今押した＝最後に来た」ので末尾に足す（mergeReactions もDB由来を後ろに積む）。
    usersByEmoji.set(next.emoji, [...(usersByEmoji.get(next.emoji) ?? []), viewer]);
  }

  const kept = chips.filter((chip) => chip.count > 0);
  for (const chip of kept) {
    chip.reactedByViewer = chip.emoji === next?.emoji;
  }
  // Array#sort は安定なので、同数チップの相対順は元の並びのまま保たれる（mergeReactions と同じ規則）。
  kept.sort((a, b) => b.count - a.count);

  return {
    total: kept.reduce((sum, chip) => sum + chip.count, 0),
    chips: kept,
    usersByEmoji: Object.fromEntries(
      kept.map((chip) => [chip.emoji, usersByEmoji.get(chip.emoji) ?? []])
    ),
    viewerEmoji: next?.emoji ?? null,
  };
}
