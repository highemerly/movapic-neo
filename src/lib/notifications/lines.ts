/**
 * 通知本文の共通の形。各種別のモジュール（*NotificationType.ts 等）がこの形で文言を返し、
 * 表示は NotificationBody 1か所で組む（ベルと通知ページで文言・分岐を二重に書かない）。
 *
 * - 1行目（title）: 絵文字＋要点（何の通知か）
 * - 2行目（detail）: ベルは幅が狭いので短い体言止め、通知ページは文章（詳細は（）に入れて「。」で終える）
 *
 * クライアントからも import されるため React・サーバー専用 API・env を import しないこと。
 */

export type NotificationVariant = "bell" | "page";

export interface NotificationLines {
  title: string;
  detail: string;
}
