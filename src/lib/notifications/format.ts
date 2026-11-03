/**
 * 通知の表示整形（ベル・通知ページで共用する純粋関数。client/server 双方から import 可）。
 */

import type { FavoriteFeedData } from "@/components/layout/useUnseenNotifications";

/** 通知の日時表示。日付に加えて時刻も出す（例: 2026年6月17日 14:30）。 */
export function formatNotificationDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 通知に並べるリアクション絵文字の最大数。 */
export const NOTIFICATION_REACTION_EMOJI_LIMIT = 3;

/**
 * 通知に並べる直近のリアクション絵文字（最新順）。favoriters は最新順で保存されている
 * （favoriteNotifications.ts の orderByRecency）。同じ絵文字が続いてもまとめず、件数どおり並べる。
 * 絵文字を持たない旧通知の行は飛ばす（全部無ければ空＝呼び出し側で既定アイコン）。
 */
export function latestReactionEmojis(
  fav: FavoriteFeedData | null,
  limit = NOTIFICATION_REACTION_EMOJI_LIMIT
): { emoji: string; imageUrl: string | null }[] {
  return (fav?.favoriters ?? [])
    .filter((f) => f.emoji)
    .slice(0, limit)
    .map((f) => ({ emoji: f.emoji!, imageUrl: f.emojiImageUrl }));
}

/** アイコンの代替テキスト用の名前。表示名が無ければ acct のローカル部（@より前）で代替し、ドメインは出さない。 */
export function favoriterName(f: FavoriteFeedData["favoriters"][number]): string {
  return f.displayName?.trim() || f.acct.split("@")[0];
}

/**
 * 並べた絵文字に収まらなかった件数（「＋N」）。並べた数を合計から引くだけ。
 * 文章は出さない（絵文字だけでリアクション通知と分かり、左にサムネもあるため）。
 */
export function favoriteNotificationOverflow(
  fav: FavoriteFeedData | null,
  shown: number
): number {
  return Math.max(0, (fav?.count ?? 0) - shown);
}
