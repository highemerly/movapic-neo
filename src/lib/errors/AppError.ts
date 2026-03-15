/**
 * アプリケーションエラークラス
 */

import { ErrorCode } from "./codes";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public suggestion?: string,
    public requestId?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * 画像処理エラー（ステージ別タイムアウト対応）
 */
export type ProcessStage = "rotate" | "resize" | "overlay" | "composite" | "convert";

export class ImageProcessError extends Error {
  constructor(
    message: string,
    public stage: ProcessStage,
    public requestId?: string
  ) {
    super(message);
    this.name = "ImageProcessError";
  }
}
