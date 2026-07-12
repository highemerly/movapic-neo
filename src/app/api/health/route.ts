/**
 * ヘルスチェック（全 pod の readiness/liveness 用）
 * GET /api/health
 *
 * DB/外部依存に触れずに 200 を返す。Topic B で削除した /api/auth/session の
 * プローブ用途を置き換える。
 */

import { NextResponse } from "next/server";
import { runtimeVersions } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = process.env.COMPONENT_ROLE || "all-in-one";
  const body: Record<string, unknown> = {
    ok: true,
    role,
    versions: runtimeVersions(),
  };

  // compute だけが sharp を積む。/admin/stats のヘルスカード表示用に
  // sharp/libvips バージョンを載せる（lazy import で非画像 pod には載せない）。
  if (role === "compute") {
    try {
      const sharp = (await import("sharp")).default;
      body.sharp = sharp.versions.sharp;
      body.vips = sharp.versions.vips;
    } catch {
      // sharp 未ロードでも health 自体は 200 を維持
    }
  }

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
