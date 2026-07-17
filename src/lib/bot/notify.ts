/**
 * Bot から管理者への direct（DM）通知。
 *
 * 通報など運営者向けのお知らせを、メンション Bot アカウントから
 * 管理者の acct 宛に visibility=direct で投稿する。返信ではなく単発投稿。
 */

import { USER_AGENT } from "@/lib/userAgent";

const REQUEST_TIMEOUT = 30000;

const getBotInstanceUrl = () => process.env.MASTODON_BOT_INSTANCE_URL || "";
const getBotAccessToken = () => process.env.MASTODON_BOT_ACCESS_TOKEN || "";

/**
 * 管理者 acct（username@domain）の配列に対し、direct で同じメッセージを送る。
 * Bot トークン未設定や送信失敗はログのみ（呼び出し側の処理は止めない）。
 */
export async function sendBotDirectMessage(
  toAccts: string[],
  message: string
): Promise<void> {
  const accessToken = getBotAccessToken();
  if (!accessToken) {
    console.warn("[bot-notify] MASTODON_BOT_ACCESS_TOKEN 未設定のため通知をスキップ");
    return;
  }
  if (!getBotInstanceUrl()) {
    console.warn("[bot-notify] MASTODON_BOT_INSTANCE_URL 未設定のため通知をスキップ");
    return;
  }
  if (toAccts.length === 0) {
    console.warn("[bot-notify] 宛先 acct が空のため通知をスキップ");
    return;
  }

  const instanceUrl = getBotInstanceUrl();
  // 宛先全員をメンションして1通の direct 投稿にまとめる
  const mentions = toAccts.map((acct) => `@${acct}`).join(" ");
  const statusText = `${mentions}\n${message}`;

  const response = await fetch(`${instanceUrl}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      status: statusText,
      visibility: "direct",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    console.error(`[bot-notify] direct 投稿失敗: ${response.status}`);
  }
}
