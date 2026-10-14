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
}

/** 表示名。無ければ acct のローカル部（@より前）で代替し、ドメインは出さない。 */
function replierName(reply: ReplyFeedData | null): string | null {
  return reply?.displayName?.trim() || reply?.acct.split("@")[0] || null;
}

/** ベル用の1行本文。 */
export function replyNotificationText(reply: ReplyFeedData | null): string {
  const name = replierName(reply);
  return name
    ? `💬 ${name}さんがあなたの写真にスレッドで投稿しました`
    : "💬 あなたの写真にスレッドで投稿されました";
}

/** 通知一覧の1行目。 */
export function replyNotificationTitle(): string {
  return "スレッドに投稿されました";
}

/** 通知一覧の2行目（誰から）。 */
export function replyNotificationWho(reply: ReplyFeedData | null): string {
  const name = replierName(reply);
  return name ? `${name}さんがあなたの写真に続けて投稿しました` : "あなたの写真に続けて投稿されました";
}
