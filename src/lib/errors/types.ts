/**
 * API エラーレスポンス型定義
 */

import { ErrorCode } from "./codes";

export interface ApiError {
  code: ErrorCode;
  message: string;
  suggestion?: string;
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
