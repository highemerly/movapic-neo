/**
 * 「よく使う」リアクションの localStorage 管理。
 *
 * 直近に押したリアクション（Unicode・カスタム絵文字とも）を端末に覚えておき、ピッカーの
 * 「よく使う」タブに管理者既定（REACTION_EMOJIS）と合わせて並べる。
 */

export const RECENT_REACTIONS_KEY = "shamezo:recent-reactions";
export const MAX_RECENT_REACTIONS = 24;

export interface RecentReaction {
  /** 内部キー（Unicodeは正規化済み・カスタムは :name@host:） */
  emoji: string;
  /** カスタム絵文字の表示用画像URL（Unicodeは null） */
  imageUrl: string | null;
}

export function loadRecentReactions(): RecentReaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_REACTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentReaction =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as RecentReaction).emoji === "string"
    );
  } catch {
    // 壊れた値が入っていても機能自体は動かせる（よく使うが空になるだけ）
    return [];
  }
}

export function pushRecentReaction(entry: RecentReaction): RecentReaction[] {
  const next = [
    entry,
    ...loadRecentReactions().filter((item) => item.emoji !== entry.emoji),
  ].slice(0, MAX_RECENT_REACTIONS);
  try {
    window.localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(next));
  } catch {
    // プライベートブラウジング等で保存できなくても選択自体は成立する
  }
  return next;
}
