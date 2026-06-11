/**
 * ヘルスチェック（全 pod の readiness/liveness 用）
 * GET /api/health
 *
 * DB/外部依存に触れずに 200 を返す。Topic B で削除した /api/auth/session の
 * プローブ用途を置き換える。
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, role: process.env.COMPONENT_ROLE || "all-in-one" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
