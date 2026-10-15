/**
 * Bot（メンション投稿）の返信文言（純粋関数）。
 */

import { isAuthFailureStatus } from "@/lib/fediverse/failureAdvice";

/**
 * SHAMEZO には保存できたが、連携先サーバーへの投稿に失敗したときの返信。
 * 画像は保存済みなので、やり直しは「もう一度メンション」ではなく画像ページからの再投稿で案内する
 * （メンションし直すと同じ写真の画像が SHAMEZO に2枚できる）。
 * 連携失効（401/403）のときは、再ログインしないと再投稿も失敗するので案内を足す。
 */
export function federationFailedMessage(params: {
  serverDomain: string;
  imagePageUrl: string;
  statusCode: number | undefined;
  appUrl: string;
}): string {
  const { serverDomain, imagePageUrl, statusCode, appUrl } = params;
  const message =
    `SHAMEZOには投稿できましたが、${serverDomain}への投稿に失敗しました。` +
    `${imagePageUrl} から再投稿することもできます。`;
  if (!isAuthFailureStatus(statusCode)) return message;
  return (
    `${message}\n` +
    `${serverDomain} との連携が切れている可能性があります。` +
    `SHAMEZO${appUrl ? `（${appUrl}）` : ""}に再ログインしてから再投稿してください。`
  );
}
