/**
 * リプライ通知（type・ペイロード・表示文言）の単一ソース。
 *
 * ベル（NotificationBell）と通知一覧（NotificationsList）で文言・分岐を二重に書くと、片方だけ直して
 * 無言で食い違う（makeup-reminder で起きた pitfall。src/lib/makeup/notificationTypes.ts 参照）ため、
 * ここ1箇所から引く。
 *
 * クライアントからも import されるため React・サーバー専用 API・env を import しないこと。
 */

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

/**
 * 1行本文（ベルと通知一覧の1行目で共用）。種別だけ伝え、誰からかは通知一覧の2行目のアイコンで出す。
 */
export function replyNotificationText(): string {
  return "💬 スレッドに投稿";
}
