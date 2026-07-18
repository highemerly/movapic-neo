/**
 * 連合投稿失敗時の「原因の推定」と「対処の提案」を HTTP ステータスから決める（純粋関数）。
 *
 * Web（postFlash のトースト）と Bot（メンションへのエラーリプライ）で共用する。
 * 原因説明はステータスコードから共通に決まるが、対処の文言は経路で異なる
 * （Web=「⋯」メニューから再投稿 / Bot=もう一度メンション）ため、呼び出し側から
 * suggestions として渡す。status を持たない（タイムアウト・接続失敗）場合は undefined を渡す。
 */

export interface PostFailureSuggestions {
  /** 一時的な失敗（過負荷・混雑・障害など）：そのまま再試行すれば直る見込みの案内 */
  retry: string;
  /** 権限・連携の失敗：再ログインが必要な場合の案内 */
  relogin: string;
}

export interface PostFailureAdvice {
  explanation: string;
  suggestion: string;
  /**
   * 連携失効（401/403）＝再試行では直らない恒久的エラー。
   * Bot 側はこれを見て自動リトライを打ち切る（リトライしても同じ失敗リプライが重複するだけ）。
   */
  authFailure: boolean;
}

export function failureAdvice(
  serverDomain: string,
  statusCode: number | undefined,
  suggestions: PostFailureSuggestions
): PostFailureAdvice {
  // タイムアウト・接続失敗（status なし）／5xx：一時的な過負荷・障害
  if (statusCode === undefined || statusCode >= 500) {
    return {
      explanation: `${serverDomain} が過負荷、または障害が発生している可能性があります`,
      suggestion: suggestions.retry,
      authFailure: false,
    };
  }
  // 429：リクエスト集中
  if (statusCode === 429) {
    return {
      explanation: `${serverDomain} へのリクエストが集中しています`,
      suggestion: suggestions.retry,
      authFailure: false,
    };
  }
  // 401 / 403：権限不足（連携失効など）。再試行だけでは直らないので再ログインを促す。
  if (statusCode === 401 || statusCode === 403) {
    return {
      explanation: `${serverDomain} への投稿権限が不足しています（連携が失効している可能性があります）`,
      suggestion: suggestions.relogin,
      authFailure: true,
    };
  }
  // 404 / 410：投稿先が無い・サーバー閉鎖
  if (statusCode === 404 || statusCode === 410) {
    return {
      explanation: `${serverDomain} の投稿先が見つからないか、サーバーが閉鎖されています`,
      suggestion: suggestions.relogin,
      authFailure: false,
    };
  }
  // 422：内容を受け付けられない
  if (statusCode === 422) {
    return {
      explanation: `${serverDomain} が投稿内容を受け付けませんでした`,
      suggestion: suggestions.retry,
      authFailure: false,
    };
  }
  // その他の 4xx
  return {
    explanation: `${serverDomain} への投稿でエラーが発生しました`,
    suggestion: suggestions.retry,
    authFailure: false,
  };
}
