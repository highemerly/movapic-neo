/**
 * 「先月の月次画像を作れます」通知の type・遷移先・表示文言の単一ソース。
 *
 * 月次画像（カレンダーのコラージュ）は作る機能だけあって、作るきっかけが無かった。月が終わった
 * タイミングで先月を振り返る導線として、月初に先月投稿した人へ1通送る（作成は定期ジョブ）。
 *
 * ベル（NotificationBell）と通知一覧（NotificationsList）で文言・遷移先を二重に書かないよう
 * ここ1箇所から引く（makeup-reminder で起きた pitfall。src/lib/makeup/notificationTypes.ts 参照）。
 *
 * クライアントからも import されるため React・サーバー専用 API・env を import しないこと。
 */

import { parseYm } from "@/lib/jst";

export const MONTHLY_COLLAGE_NOTIFICATION_TYPE = "monthly-collage";

/** カレンダーで月次画像のダイアログを開いた状態で表示するクエリ（`?collage=1`）。 */
export const COLLAGE_OPEN_QUERY = "collage";

/** type="monthly-collage" の Notification.data。 */
export interface MonthlyCollageNotificationData {
  /** 対象月 "YYYY-MM"（JST） */
  ym: string;
}

/**
 * 通知の id。ユーザー×対象月で1通に決めるため決定的にする（定期ジョブが何度走っても重複しない）。
 * Notification には一意制約が無いので、二重作成はこの主キーで弾く。
 */
export function monthlyCollageNotificationId(userId: string, ym: string): string {
  return `monthly-collage-${userId}-${ym}`;
}

/** Notification.data から monthly-collage のペイロードを取り出す（形が違えば null）。 */
export function toMonthlyCollageNotificationData(
  data: unknown
): MonthlyCollageNotificationData | null {
  if (typeof data !== "object" || data === null) return null;
  const { ym } = data as Record<string, unknown>;
  return typeof ym === "string" && /^\d{4}-\d{2}$/.test(ym) ? { ym } : null;
}

/** 1行本文（ベルと通知一覧の1行目で共用）。 */
export function monthlyCollageNotificationText(data: MonthlyCollageNotificationData | null): string {
  return data ? `${parseYm(data.ym).month}月の月次画像を作れます` : "月次画像を作れます";
}

/** 通知一覧の2行目。 */
export function monthlyCollageNotificationDetail(): string {
  return "ひと月の写真を1枚にまとめて、振り返ったり共有したりできます";
}

/**
 * 遷移先: 対象月のカレンダーを、月次画像のダイアログを開いた状態で表示する。
 * ym が読めない行は当月のカレンダー（ダイアログは開かない＝どの月か分からないため）。
 */
export function monthlyCollageNotificationHref(
  userSeg: string,
  data: MonthlyCollageNotificationData | null
): string {
  if (!data) return `/u/${userSeg}/calendar`;
  const { year, month } = parseYm(data.ym);
  return `/u/${userSeg}/calendar?year=${year}&month=${month}&${COLLAGE_OPEN_QUERY}=1`;
}

/** 通知のアイコン名（AchievementIcon に登録済みの lucide アイコン名）。 */
export const MONTHLY_COLLAGE_NOTIFICATION_ICON = "Images";
