/**
 * クライアント側エラーハンドリングユーティリティ
 */

export interface ParsedApiError {
  message: string;
  suggestion?: string;
  supportInfo?: string; // "Error code: {status} {code} {requestId}"
  retryAfterSeconds?: number; // 429時、再試行可能までの秒数（Retry-Afterヘッダー由来）
}

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    suggestion?: string;
    requestId?: string;
  };
}

/**
 * 正常なJSONエラーボディを持たない応答（ゲートウェイ/インフラ由来の50x等）の
 * フォールバックメッセージをステータスコードから決める
 */
function statusFallback(status: number): { message: string; suggestion?: string } {
  if (status === 500) {
    return {
      message: "サーバーでエラーが発生しました",
      suggestion: "時間をおいて再試行し、解決しない場合は管理者へお問い合わせください",
    };
  }
  if (status === 501 || status === 503 || status === 504) {
    return {
      message: "サーバーが混み合っています",
      suggestion: "しばらく待ってから再試行してください",
    };
  }
  return { message: "エラーが発生しました" };
}

/**
 * APIレスポンスからエラー情報をパース
 */
export async function parseApiError(
  response: Response
): Promise<ParsedApiError> {
  const status = response.status;

  // Retry-Afterヘッダー（429のレート制限時に秒数が入る）
  const retryAfterRaw = response.headers.get("Retry-After");
  const retryAfterSeconds =
    retryAfterRaw && /^\d+$/.test(retryAfterRaw) ? Number(retryAfterRaw) : undefined;

  try {
    const data = await response.json();

    // 新形式のエラーレスポンス
    if (data.success === false && data.error) {
      const { code, message, suggestion, requestId } = data.error as ApiErrorResponse["error"];

      // サポート情報を組み立て
      const supportParts = [status.toString(), code];
      if (requestId) {
        supportParts.push(requestId);
      }
      const supportInfo = `Error code: ${supportParts.join(" ")}`;

      return {
        message,
        suggestion,
        supportInfo,
        retryAfterSeconds,
      };
    }

    // 旧形式のエラーレスポンス（後方互換性）
    if (data.error && typeof data.error === "string") {
      return {
        message: data.error,
        supportInfo: `Error code: ${status}`,
      };
    }

    // 想定外の形式
    return {
      ...statusFallback(status),
      supportInfo: `Error code: ${status}`,
      retryAfterSeconds,
    };
  } catch {
    // JSONパース失敗（ボディなし/HTMLなど。インフラ由来の50xを想定）
    return {
      ...statusFallback(status),
      supportInfo: `Error code: ${status}`,
      retryAfterSeconds,
    };
  }
}

/**
 * エラーメッセージを組み立て（suggestion含む）
 */
export function formatErrorMessage(error: ParsedApiError): string {
  if (error.suggestion) {
    return `${error.message}（${error.suggestion}）`;
  }
  return error.message;
}
