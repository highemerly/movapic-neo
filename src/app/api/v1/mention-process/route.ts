/**
 * 後方互換エイリアス（旧パス）
 * 正規パスは /api/v1/ingest/mention。外部（cronjob）を新パスへ更新後に本ファイルを削除する。
 * Next の route 検出に確実に拾われるよう named const として再エクスポートする。
 */
import { POST as forwardedPost } from "@/app/api/v1/ingest/mention/route";

export const POST = forwardedPost;
