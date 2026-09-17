/**
 * 穴埋めポイント制の通知（type・ペイロード・表示文言）の単一ソース。
 *
 * 表示文言をここに置く理由（pitfall）: 従来の makeup-reminder は、ベル（NotificationBell）と
 * 通知一覧（NotificationsList）にそれぞれ文言と分岐がベタ書きされていて、片方だけ直すと
 * 無言で食い違う構造だった。type を増やすのを機に、判定・文言・遷移先をここ1箇所から引く。
 *
 * クライアントからも import されるため React・サーバー専用 API・env を import しないこと。
 */

import { PERFECT_MONTH_CATEGORY } from "@/lib/achievements/perfectMonth";
import { parseYm } from "@/lib/jst";
import { findMakeupEventByReason } from "./events";
import { MAKEUP_POINT_REASONS } from "./points";

/** achievementKey の接頭辞（perfectMonthKey が作る perfect-month:YYYY-MM の前半）。 */
const PERFECT_MONTH_KEY_PREFIX = `${PERFECT_MONTH_CATEGORY}:`;

export const MAKEUP_NOTIFICATION_TYPES = {
  /** ポイントが付与された（付与1回につき1通）。 */
  POINT: "makeup-point",
  /** 今日1枚目を投稿した・穴がある・残高がある → 「今日2枚目を投稿しよう」（1日1通）。 */
  NEED_SECOND: "makeup-need-second",
  /** 今日2枚目を投稿した（または付与で残高ができた）・まだ今日の donor が無い → 「今すぐ穴埋めしよう」（1日1通）。 */
  READY: "makeup-ready",
  /**
   * 2026-09 以前の月の穴埋め推奨（月1通）。既存行の表示互換のため type 自体は残す。
   * 新規作成は 2026-10-01 以降起きない。
   */
  LEGACY_REMINDER: "makeup-reminder",
} as const;

export type MakeupNotificationType =
  (typeof MAKEUP_NOTIFICATION_TYPES)[keyof typeof MAKEUP_NOTIFICATION_TYPES];

const MAKEUP_TYPE_SET: ReadonlySet<string> = new Set(Object.values(MAKEUP_NOTIFICATION_TYPES));

/** 穴埋め系の通知か（通知一覧のカテゴリ振り分け・カレンダー遷移に使う）。 */
export function isMakeupNotificationType(type: string): type is MakeupNotificationType {
  return MAKEUP_TYPE_SET.has(type);
}

/** type="makeup-point" の Notification.data。 */
export interface MakeupPointNotificationData {
  reason: string;
  amount: number;
}

/** 通知フィードに載せる makeup-point の表示用データ（label はサーバーで解決済み）。 */
export interface MakeupPointFeedData extends MakeupPointNotificationData {
  label: string;
}

/**
 * 付与理由の表示名。`event:<key>` はイベント一覧（events.ts）の名前、一覧に無ければ「イベント」。
 * 特典サーバー名は env（FAVOR_SERVERS）由来でクライアントからは読めないので、呼び出し側が渡す
 * （サーバーは getFavorServers()、カレンダーはページから受け取った一覧）。
 */
export function makeupPointReasonLabel(reason: string, favorServers: readonly string[]): string {
  switch (reason) {
    case MAKEUP_POINT_REASONS.FAVOR_MONTHLY:
      return favorServers.length > 0 ? `${favorServers.join("・")} 所属特典` : "サーバー特典";
    case MAKEUP_POINT_REASONS.MONTHLY_CATCHUP:
      return "皆勤賞応援プレゼント";
    case MAKEUP_POINT_REASONS.SIGNUP:
      return "新規ユーザー特別プレゼント";
    case MAKEUP_POINT_REASONS.ACHIEVEMENT:
      return "実績の達成";
    default:
      if (reason.startsWith("event:")) return findMakeupEventByReason(reason)?.name ?? "イベント";
      return "付与";
  }
}

/**
 * 穴埋め系通知の表示文言。ym は achievementKey（perfect-month:YYYY-MM）から取った対象月。
 * point は makeup-point のときだけ使う。
 */
export function makeupNotificationText(
  type: MakeupNotificationType,
  ym: string | null,
  point: MakeupPointFeedData | null
): string {
  const monthLabel = ym ? `${parseYm(ym).month}月の` : "";
  switch (type) {
    case MAKEUP_NOTIFICATION_TYPES.POINT:
      return point
        ? `${monthLabel}穴埋めポイントを${point.amount}pt獲得しました！（${point.label}）`
        : `${monthLabel}穴埋めポイントを獲得しました！`;
    case MAKEUP_NOTIFICATION_TYPES.NEED_SECOND:
      return "穴埋めできる日があります。今日2枚目を投稿しよう！";
    case MAKEUP_NOTIFICATION_TYPES.READY:
      return "穴埋めできるようになりました。カレンダーから今すぐ穴埋めしよう！";
    case MAKEUP_NOTIFICATION_TYPES.LEGACY_REMINDER:
      return "皆勤賞まであと少し！1日2枚投稿して、穴埋めしよう。";
  }
}

/**
 * 穴埋め系通知の遷移先（対象月のカレンダー）。ym が無い旧通知は当月のカレンダー。
 * userSeg は /u/ のパスセグメント（受信者本人）。
 */
export function makeupNotificationHref(userSeg: string, ym: string | null): string {
  if (!ym) return `/u/${userSeg}/calendar`;
  const { year, month } = parseYm(ym);
  return `/u/${userSeg}/calendar?year=${year}&month=${month}`;
}

/** 通知の achievementKey（perfect-month:YYYY-MM）から対象月を取り出す。形が違えば null。 */
export function makeupNotificationYm(achievementKey: string | null): string | null {
  if (!achievementKey?.startsWith(PERFECT_MONTH_KEY_PREFIX)) return null;
  const ym = achievementKey.slice(PERFECT_MONTH_KEY_PREFIX.length);
  return /^\d{4}-\d{2}$/.test(ym) ? ym : null;
}

/** Notification.data から makeup-point のペイロードを取り出す（形が違えば null）。 */
export function toMakeupPointNotificationData(data: unknown): MakeupPointNotificationData | null {
  if (typeof data !== "object" || data === null) return null;
  const { reason, amount } = data as Record<string, unknown>;
  return typeof reason === "string" && typeof amount === "number" ? { reason, amount } : null;
}

/** 通知一覧の2行目（補足説明）。 */
export function makeupNotificationDetail(type: MakeupNotificationType): string {
  switch (type) {
    case MAKEUP_NOTIFICATION_TYPES.POINT:
      return "残りのポイントと付与履歴はカレンダーで確認できます";
    case MAKEUP_NOTIFICATION_TYPES.NEED_SECOND:
      return "今日もう1枚投稿すると、その写真で投稿を忘れた日を埋められます";
    case MAKEUP_NOTIFICATION_TYPES.READY:
      return "カレンダーの「編集」から、埋める日を選べます";
    case MAKEUP_NOTIFICATION_TYPES.LEGACY_REMINDER:
      return "別日に2枚以上投稿すると、未投稿の日を穴埋めできます";
  }
}

/** 通知のアイコン名（AchievementIcon に登録済みの lucide アイコン名）。 */
export function makeupNotificationIcon(type: MakeupNotificationType): "Crown" | "CalendarDays" {
  return type === MAKEUP_NOTIFICATION_TYPES.POINT ? "CalendarDays" : "Crown";
}
