/**
 * 通知の表示整形（ベル・通知ページで共用する純粋関数。client/server 双方から import 可）。
 */

import type { FavoriteFeedData } from "@/components/layout/useUnseenNotifications";

/** 通知の日時表示。日付に加えて時刻も出す（例: 2026年6月17日 14:30）。 */
export function formatNotificationDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * お気に入りした相手の表示（ID/acct は出さず表示名のみ）。複数人は「他N人」にまとめる。
 * 通知一覧の説明行用。例: 「dev02さん 他5人」
 */
export function favoriteNotificationWho(fav: FavoriteFeedData | null): string {
  const latest = fav?.favoriters[0];
  // 表示名がなければ acct のローカル部（@より前）で代替し、ドメインID は出さない
  const name = latest?.displayName?.trim() || latest?.acct?.split("@")[0] || null;
  const count = fav?.count ?? 0;

  if (!name) {
    return count > 1 ? `${count}人がお気に入りしました` : "お気に入りされました";
  }
  const others = count - 1;
  return others > 0 ? `${name}さん、他${others}人` : `${name}さん`;
}

/** 「○○さんがお気に入りしました」本文（1行表示・ベル用）。複数人は「他N人」にまとめる。 */
export function favoriteNotificationText(fav: FavoriteFeedData | null): string {
  const latest = fav?.favoriters[0];
  const name = latest?.displayName?.trim() || latest?.acct || null;
  const count = fav?.count ?? 0;

  // 表示できる名前が無い（remoteユーザーで favourited_by が取れない等）場合は人数のみ
  if (!name) {
    return count > 1
      ? `❤️ あなたの写真が${count}人にお気に入りされました`
      : `❤️ あなたの写真が`;
  }

  const others = count - 1;
  return others > 0
    ? `❤️ ${name}さん 他${others}人があなたの写真をお気に入りしました`
    : `❤️ ${name}さんがあなたの写真をお気に入りしました`;
}
