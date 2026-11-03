/**
 * 「おかえり」通知（しばらく投稿が空いた後の投稿）の type・判定・表示文言の単一ソース。
 *
 * 習慣が途切れた人が戻ってきたとき、途切れた事実ではなく戻ってきたことを肯定するための通知。
 * 実績にしない（一度きりの付与では2回目以降の復帰を迎えられないため）。毎回の復帰で1通作る。
 *
 * ベル（NotificationBell）と通知一覧（NotificationsList）、投稿直後のトーストで文言を二重に書かないよう
 * ここ1箇所から引く（makeup-reminder で起きた pitfall。src/lib/makeup/notificationTypes.ts 参照）。
 *
 * クライアントからも import されるため React・サーバー専用 API・env を import しないこと。
 */

import { toJstDateString } from "@/lib/streak";

export const WELCOME_BACK_NOTIFICATION_TYPE = "welcome-back";

/** 前回の投稿からこの日数以上空いた投稿を「おかえり」とみなす（JST の暦日差）。 */
export const WELCOME_BACK_MIN_DAYS = 30;

/** type="welcome-back" の Notification.data。 */
export interface WelcomeBackNotificationData {
  /** 前回の投稿から何日ぶりか（JST の暦日差） */
  days: number;
}

/**
 * 通知の id。投稿1件につき1通に決めるため決定的にする（同じ投稿で2回呼ばれても重複させない）。
 * 投稿直後のトーストもこの id で引く＝「おかえり」の判定は投稿時の1回だけで、表示側で再計算しない。
 */
export function welcomeBackNotificationId(imageId: string): string {
  return `welcome-back-${imageId}`;
}

/** 2つの時刻の JST の暦日差（later − earlier）。 */
function jstDayDiff(earlier: Date, later: Date): number {
  const toUtcDay = (d: Date) => {
    const [y, m, day] = toJstDateString(d).split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtcDay(later) - toUtcDay(earlier)) / (24 * 60 * 60 * 1000));
}

/**
 * 「おかえり」に当たるなら何日ぶりかを返す。前回の投稿が無い（初投稿）か、空きが短ければ null。
 * 暦日で数えるのは、カレンダーや連続投稿と同じ「日」の感覚に揃えるため（深夜をまたいだ投稿で揺れない）。
 */
export function welcomeBackDays(previousPostAt: Date | null, postedAt: Date): number | null {
  if (!previousPostAt) return null;
  const days = jstDayDiff(previousPostAt, postedAt);
  return days >= WELCOME_BACK_MIN_DAYS ? days : null;
}

/** Notification.data から welcome-back のペイロードを取り出す（形が違えば null）。 */
export function toWelcomeBackNotificationData(data: unknown): WelcomeBackNotificationData | null {
  if (typeof data !== "object" || data === null) return null;
  const { days } = data as Record<string, unknown>;
  return typeof days === "number" ? { days } : null;
}

/**
 * 本文（ベル・通知一覧・投稿直後のトーストで共用）。補足の2行目は持たず、この1文だけで伝える
 * （トーストに2行目を足すと長くなり、投稿完了のトーストと重なって読みにくいため）。
 */
export function welcomeBackNotificationText(data: WelcomeBackNotificationData | null): string {
  const thanks = "戻ってきてくれてうれしいです！";
  return data
    ? `おかえりなさい！${data.days}日ぶりの投稿です。${thanks}`
    : `おかえりなさい！${thanks}`;
}

/** 写真が削除されたときに出すアイコン名（AchievementIcon に登録済みの lucide アイコン名）。 */
export const WELCOME_BACK_NOTIFICATION_ICON = "Sparkles";
