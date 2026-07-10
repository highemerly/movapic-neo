/**
 * Mastodon Streaming（メンション受信 WebSocket）の接続状況ヘルスチェック。
 * GET /api/health/stream
 *
 * streaming は worker-front（と dev all-in-one）の常駐プロセスでのみ起動する。
 * 監視からの定期取得を想定し、接続が期待される役割で未接続のときは 503 を返す
 * （uptime 監視がアラートできるように）。それ以外は 200。
 *
 * 注: web/compute pod では streaming は起動しないため ok:true / 200（情報のみ）。
 */

import { NextResponse } from "next/server";
import { summarizeMentionStream } from "@/lib/mention/streamer";

export const dynamic = "force-dynamic";

export function GET() {
  const role = process.env.COMPONENT_ROLE || "all-in-one";
  const streamingExpected = role === "worker-front" || role === "all-in-one";

  const h = summarizeMentionStream();

  const body = {
    ok: streamingExpected ? h.connected : true,
    role,
    streamingExpected,
    ...h,
  };

  // 接続が期待される役割で未接続なら 503（監視アラート用）。それ以外は 200。
  const httpStatus = streamingExpected && !h.connected ? 503 : 200;

  return NextResponse.json(body, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
