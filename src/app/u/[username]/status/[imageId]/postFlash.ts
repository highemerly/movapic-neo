import type { FlashToast } from "@/components/ToastFlasher";

/**
 * サーバーが返した HTTP ステータスコードから、ユーザー向けの対応案内文を決める。
 * status を持たない（タイムアウト・接続失敗）場合は undefined を渡す。
 */
function statusAdvice(statusCode?: number): string {
  if (statusCode === undefined) {
    return "が過負荷または障害の可能性があります。時間をおいて再度お試しください。";
  }
  if (statusCode === 401 || statusCode === 403) {
    return "への権限が不足しています。一度ログアウトして再ログインをお試しください。";
  }
  if (statusCode === 404 || statusCode === 410) {
    return "での投稿先が見つからないか、サーバーが閉鎖されています。一度ログアウトして再ログインをお試しください。";
  }
  if (statusCode === 422) {
    return "で投稿を受け付けてもらえませんでした。時間をおいて再度お試しください。";
  }
  if (statusCode === 429) {
    return "でリクエストが集中しています。しばらく待ってから再度お試しください。";
  }
  if (statusCode >= 500) {
    return "が過負荷または障害の可能性があります。時間をおいて再度お試しください。";
  }
  return "時間をおいて再度お試しください。";
}

/**
 * 投稿完了ページで表示するフラッシュトーストを組み立てる。
 * - 通常: 「投稿が完了しました」（成功・自動消滅）
 * - Fediverse 投稿だけ失敗（部分的成功）: 警告。完了ではないので自動では消さない（duration: Infinity）。
 */
export function buildPostFlash({
  fediverseFailed,
  serverDomain,
  statusCode,
}: {
  fediverseFailed: boolean;
  serverDomain: string;
  statusCode?: number;
}): FlashToast {
  if (!fediverseFailed) {
    return { variant: "success", message: "投稿が完了しました" };
  }

  const response = statusCode !== undefined ? `${statusCode}` : "応答なし";
  return {
    variant: "warning",
    message: `SHAMEZOには投稿できましたが、${serverDomain} への投稿に失敗しました`,
    description: `サーバーからの応答: ${response}（${serverDomain} ${statusAdvice(statusCode)}）`,
    duration: Infinity,
  };
}
