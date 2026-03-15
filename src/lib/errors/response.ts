/**
 * 統一エラーレスポンス生成ヘルパー
 */

import { NextResponse } from "next/server";
import { ErrorCode, ErrorCodes } from "./codes";
import { AppError, ImageProcessError } from "./AppError";

interface ErrorResponseOptions {
  suggestion?: string;
  requestId?: string;
  headers?: Record<string, string>;
}

/**
 * エラーレスポンスを生成
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  options?: ErrorResponseOptions
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(options?.suggestion && { suggestion: options.suggestion }),
        ...(options?.requestId && { requestId: options.requestId }),
      },
    },
    {
      status: statusCode,
      headers: options?.headers,
    }
  );
}

/**
 * AppErrorをレスポンスに変換
 */
export function handleAppError(error: AppError) {
  return errorResponse(error.code, error.message, error.statusCode, {
    suggestion: error.suggestion,
    requestId: error.requestId,
  });
}

/**
 * 画像処理エラーをレスポンスに変換
 */
export function handleImageProcessError(error: ImageProcessError) {
  // タイムアウトの場合
  if (error.message === "タイムアウト") {
    const timeoutInfo: Record<
      string,
      { code: ErrorCode; message: string; suggestion: string }
    > = {
      rotate: {
        code: ErrorCodes.TIMEOUT_ROTATE,
        message: "画像の回転処理がタイムアウトしました",
        suggestion: "別の画像形式で再試行してください",
      },
      resize: {
        code: ErrorCodes.TIMEOUT_RESIZE,
        message: "画像のリサイズ処理がタイムアウトしました",
        suggestion: "画像サイズを小さくして再試行してください",
      },
      overlay: {
        code: ErrorCodes.TIMEOUT_OVERLAY,
        message: "テキスト描画がタイムアウトしました",
        suggestion: "テキストを短くして再試行してください",
      },
      composite: {
        code: ErrorCodes.TIMEOUT_PROCESSING,
        message: "画像の合成処理がタイムアウトしました",
        suggestion: "画像サイズを小さくして再試行してください",
      },
      convert: {
        code: ErrorCodes.TIMEOUT_CONVERT,
        message: "出力形式の変換がタイムアウトしました",
        suggestion: "「なし（JPEG）」形式で再試行してください",
      },
    };

    const info = timeoutInfo[error.stage] || {
      code: ErrorCodes.TIMEOUT_PROCESSING,
      message: "画像の処理に時間がかかりすぎました",
      suggestion: "画像サイズを小さくして再試行してください",
    };

    return errorResponse(info.code, info.message, 504, {
      suggestion: info.suggestion,
      requestId: error.requestId,
    });
  }

  // 処理失敗の場合（タイムアウト以外）
  return errorResponse(
    ErrorCodes.IMAGE_PROCESS_FAILED,
    error.message, // "画像の読み込みに失敗しました" など
    500,
    {
      suggestion: "別の画像で再試行してください",
      requestId: error.requestId,
    }
  );
}

/**
 * 不明なエラーをキャッチしてレスポンスに変換
 */
export function handleUnknownError(error: unknown, requestId?: string) {
  console.error(`[ERROR] rid=${requestId || "unknown"}`, error);
  return errorResponse(
    ErrorCodes.INTERNAL_ERROR,
    "処理中にエラーが発生しました",
    500,
    {
      suggestion: "しばらく経ってから再試行してください",
      requestId,
    }
  );
}
