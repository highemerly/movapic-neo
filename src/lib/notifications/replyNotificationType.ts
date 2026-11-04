/**
 * リプライ通知（type・ペイロード・表示文言）の単一ソース。
 *
 * ベル（NotificationBell）と通知一覧（NotificationsList）で文言・分岐を二重に書くと、片方だけ直して
 * 無言で食い違う（makeup-reminder で起きた pitfall。src/lib/makeup/notificationTypes.ts 参照）ため、
 * ここ1箇所から引く。
 *
 * クライアントからも import されるため React・サーバー専用 API・env を import しないこと。
 */

import type { NotificationVariant } from "./lines";

export const REPLY_NOTIFICATION_TYPE = "reply";

/** 通知フィードに載せるリプライの表示用データ（送信者はリプライ画像の投稿者から導出）。 */
export interface ReplyFeedData {
  /** リプライした人の表示名（未設定なら null） */
  displayName: string | null;
  /** リプライした人の username@domain */
  acct: string;
  /** リプライした人のアバター（プロキシ経由に変換済み。未設定なら null） */
  avatarUrl: string | null;
}

/** アイコンの代替テキスト用の名前。表示名が無ければ acct のローカル部（@より前）で代替し、ドメインは出さない。 */
export function replierName(reply: ReplyFeedData): string {
  return reply.displayName?.trim() || reply.acct.split("@")[0];
}

/** 1行目。絵文字だけで、何の通知かは2行目の文で言う。 */
export const REPLY_NOTIFICATION_TITLE = "💬";

/**
 * 2行目で、投稿した人のアイコンの後ろに続く文。
 * 投稿者が取れない（hasActor=false）ときは主語を省く。
 */
export function replyNotificationDetail(variant: NotificationVariant, hasActor: boolean): string {
  if (variant === "bell") return hasActor ? "さんがスレッドに投稿" : "スレッドに投稿されました";
  return hasActor ? "さんがあなたのスレッドに投稿しました。" : "あなたのスレッドに投稿されました。";
}
