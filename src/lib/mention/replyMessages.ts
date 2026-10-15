/**
 * Bot（メンション投稿）の返信文言（純粋関数）。
 */

import { isAuthFailureStatus } from "@/lib/fediverse/failureAdvice";

/**
 * SHAMEZO には保存できたが、連携先サーバーへの投稿に失敗したときの返信。
 * 画像は保存済みなので、やり直しは「もう一度メンション」ではなく画像ページからの再投稿で案内する
 * （メンションし直すと同じ写真の画像が SHAMEZO に2枚できる）。
 * 連携失効（401/403）のときは、ログインし直さないと再投稿も失敗するので、その案内に差し替える。
 */
export function federationFailedMessage(params: {
  serverDomain: string;
  imagePageUrl: string;
  statusCode: number | undefined;
}): string {
  const { serverDomain, imagePageUrl, statusCode } = params;
  const head = `SHAMEZOには投稿できましたが、${serverDomain}への投稿に失敗しました。`;
  if (isAuthFailureStatus(statusCode)) {
    return (
      head +
      `${serverDomain} との連携が切れている可能性がありますので、` +
      "SHAMEZO に一度ログインしてから再投稿してみてください。"
    );
  }
  return `${head}${imagePageUrl} から再投稿することもできます。`;
}
