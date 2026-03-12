/**
 * クライアント側エラーハンドリングユーティリティ
 */

export interface ParsedApiError {
  message: string;
  suggestion?: string;
  supportInfo?: string; // "Error code: {status} {code} {requestId}"
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
 * APIレスポンスからエラー情報をパース
 */
export async function parseApiError(
  response: Response
): Promise<ParsedApiError> {
  const status = response.status;

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
      message: "エラーが発生しました",
      supportInfo: `Error code: ${status}`,
    };
  } catch {
    // JSONパース失敗
    return {
      message: "エラーが発生しました",
      supportInfo: `Error code: ${status}`,
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
