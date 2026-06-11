/**
 * 後方互換エイリアス（旧パス）
 * 正規パスは /api/v1/ingest/email。外部（Cloudflare email worker）を新パスへ更新後に本ファイルを削除する。
 * Next の route 検出に確実に拾われるよう named const として再エクスポートする。
 */
import { POST as forwardedPost } from "@/app/api/v1/ingest/email/route";

export const POST = forwardedPost;
