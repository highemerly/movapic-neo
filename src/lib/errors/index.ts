/**
 * エラー関連のエクスポート（サーバー用）。
 *
 * クライアントコンポーネントは "@/lib/errors/client" から直接 import する（ここには載せない）。
 * pitfall: 以前はここから parseApiError も出しており、クライアントが import すると response.ts 経由で
 * next/server 一式（NextResponse・Cookie・ua-parser・URLPattern。gzip 23KB）がクライアントの
 * バンドルに入り、/u/[username]・画像詳細・/create など12ページで読み込まれていた（2026-11-10 確認）。
 */

export { ErrorCodes, type ErrorCode } from "./codes";
export type { ApiError, ApiErrorResponse, ApiSuccessResponse, ApiResponse } from "./types";
export { AppError, ImageProcessError, type ProcessStage } from "./AppError";
export {
  errorResponse,
  handleAppError,
  handleImageProcessError,
  handleUnknownError,
} from "./response";
