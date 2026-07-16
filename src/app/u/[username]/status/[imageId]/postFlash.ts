import type { FlashToast } from "@/components/ToastFlasher";

/**
 * 連合投稿失敗時の「原因の推定」と「対処の提案」を HTTP ステータスから決める。
 * status を持たない（タイムアウト・接続失敗）場合は undefined を渡す。
 */
function failureAdvice(
  serverDomain: string,
  statusCode?: number
): { explanation: string; suggestion: string } {
  // 再投稿の導線はこのページの「⋯（その他）」メニュー内にある（ImageActionsMenu）。
  const retryHere =
    "しばらく待ってから、この投稿の「⋯（その他）」メニューから再投稿してください";
  const reloginRetry =
    "一度ログアウトして再ログインしてから、この投稿の「⋯（その他）」メニューから再投稿してください";

  // タイムアウト・接続失敗（status なし）／5xx：一時的な過負荷・障害
  if (statusCode === undefined || statusCode >= 500) {
    return {
      explanation: `${serverDomain} が過負荷、または障害が発生している可能性があります`,
      suggestion: retryHere,
    };
  }
  // 429：リクエスト集中
  if (statusCode === 429) {
    return {
      explanation: `${serverDomain} へのリクエストが集中しています`,
      suggestion: retryHere,
    };
  }
  // 401 / 403：権限不足（連携失効など）。再投稿だけでは直らないので再ログインを促す。
  if (statusCode === 401 || statusCode === 403) {
    return {
      explanation: `${serverDomain} への投稿権限が不足しています（連携が失効している可能性があります）`,
      suggestion: reloginRetry,
    };
  }
  // 404 / 410：投稿先が無い・サーバー閉鎖
  if (statusCode === 404 || statusCode === 410) {
    return {
      explanation: `${serverDomain} の投稿先が見つからないか、サーバーが閉鎖されています`,
      suggestion: reloginRetry,
    };
  }
  // 422：内容を受け付けられない
  if (statusCode === 422) {
    return {
      explanation: `${serverDomain} が投稿内容を受け付けませんでした`,
      suggestion: retryHere,
    };
  }
  // その他の 4xx
  return {
    explanation: `${serverDomain} への投稿でエラーが発生しました`,
    suggestion: retryHere,
  };
}

/**
 * 投稿結果のトーストを組み立てる。作成フロー（遷移後フラッシュ）と再投稿フロー（その場）で共有する。
 * - 成功: 「{server} への投稿が完了しました」（Fediverse投稿）／「投稿が完了しました」（local）
 * - 連合投稿だけ失敗（部分的成功）: 警告。完了ではないので自動では消さない（duration: Infinity）。
 */
export function buildPostFlash({
  fediverseFailed,
  fediversePosted,
  serverDomain,
  statusCode,
}: {
  fediverseFailed: boolean;
  /** 成功時、連携サーバーへ投稿したか（local=false なら汎用文言）。 */
  fediversePosted: boolean;
  serverDomain: string;
  statusCode?: number;
}): FlashToast {
  if (!fediverseFailed) {
    return {
      variant: "success",
      message: fediversePosted
        ? `${serverDomain} への投稿が完了しました`
        : "投稿が完了しました",
    };
  }

  const response = statusCode !== undefined ? `${statusCode}` : "応答なし";
  const { explanation, suggestion } = failureAdvice(serverDomain, statusCode);
  return {
    variant: "warning",
    message: `${serverDomain} への投稿に失敗しました（サーバーからの応答： ${response}）`,
    // 2行（原因の推定＋対処）を改行で見せる。descriptionClassName で pre-line を効かせる。
    description: `${explanation}\n${suggestion}`,
    descriptionClassName: "whitespace-pre-line",
    duration: Infinity,
  };
}
