/**
 * 通知の表示整形（ベル・通知ページで共用する純粋関数。client/server 双方から import 可）。
 */

import type { FavoriteFeedData } from "@/components/layout/useUnseenNotifications";
import type { NotificationLines, NotificationVariant } from "./lines";

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
 */
export function favoriteNotificationOverflow(
  fav: FavoriteFeedData | null,
  shown: number
): number {
  return Math.max(0, (fav?.count ?? 0) - shown);
}

/**
 * 通知の2行目に並べるアイコンの最大数。1行目の絵文字と同じ数にして、だいたい同じ人たちを指すようにする
 * （ベルは幅が狭く、アイコンの後ろに文が続くため多くは並べない）。
 */
export const NOTIFICATION_ACTOR_LIMIT = NOTIFICATION_REACTION_EMOJI_LIMIT;

/**
 * リアクション通知の2行目で、アイコンの後ろに続く文。1行目は絵文字だけなので、何の通知かはここで言う
 * （絵文字・アイコンだけにしたら何の通知か分からなくなったため）。
 * 名前の一覧が取れていない（hasActors=false）ときは主語を省く。
 */
export function reactionNotificationDetail(variant: NotificationVariant, hasActors: boolean): string {
  if (variant === "bell") return hasActors ? "さんからリアクションを受信" : "リアクションを受信";
  return hasActors ? "さんからのリアクションを受信しました。" : "リアクションを受信しました。";
}

/** 実績通知の本文。説明文は通知ページだけ（）で添える。 */
export function achievementNotificationLines(
  achievement: { title: string; description: string } | null,
  variant: NotificationVariant
): NotificationLines {
  const title = `🏆${achievement?.title ?? "?"}`;
  if (variant === "bell") return { title, detail: "実績を獲得" };
  return {
    title,
    detail: achievement?.description
      ? `実績を獲得しました（${achievement.description}）。`
      : "実績を獲得しました。",
  };
}
