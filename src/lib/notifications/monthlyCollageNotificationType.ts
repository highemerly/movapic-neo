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

import { parseYm, shiftYm } from "@/lib/jst";
import { dayStart, firstDayOfYm, LATEST_CLOCK, todayOf, ymOf } from "@/lib/dayClock";
import type { NotificationLines, NotificationVariant } from "./lines";

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

/** 本文。対象月が読めない旧形式の行は月を出さない。 */
export function monthlyCollageNotificationLines(
  data: MonthlyCollageNotificationData | null,
  variant: NotificationVariant
): NotificationLines {
  const month = data ? `${parseYm(data.ym).month}月` : null;
  const title = month ? `🖼️${month}のまとめ` : "🖼️まとめ";
  if (variant === "bell") return { title, detail: "月次画像を作れます" };
  return {
    title,
    detail: `${month ? `${month}の` : ""}月次画像を作れます（ひと月の写真を1枚にまとめて、振り返ったり共有したりできます）。`,
  };
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

/**
 * 定期ジョブが今送る通知の対象月（先月）と、この周期の通知が作られ始める時刻（当月1日 4:00 JST）。
 *
 * 月は人によって始まる時刻が違う（日付の区切り 0〜4 時）ので、全員共通の「いちばん遅い時計」
 * （LATEST_CLOCK＝4時区切り）で決める。1日 0:00〜4:00 は区切りの遅い人がまだ前月にいて、その人の
 * 1日 1:00 の投稿は前月の記録日になる＝先に送ると対象から漏れうる。その間は対象月が「先々月」のまま
 * なので、先々月分は前の周期で送り済み＝新しく送る相手がいない（ジョブは何もしない）。
 */
export function monthlyCollageCycle(now: Date): { ym: string; cycleStart: Date } {
  const thisYm = ymOf(todayOf(LATEST_CLOCK, now));
  return { ym: shiftYm(thisYm, -1), cycleStart: dayStart(LATEST_CLOCK, firstDayOfYm(thisYm)) };
}
