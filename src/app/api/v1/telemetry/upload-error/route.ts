import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/telemetry/upload-error
 *
 * クライアントのアップロード失敗（uploadWithProgress の各フェーズ）を集計するための一時計測。
 * 「手元で再現しない network エラーの原因層（Vultr LB / pod 再起動 / モバイル回線）を切り分ける」
 * ためだけの軽量ログ。保存はせず pod ログ（→ Loki 収集）に出すだけ。認証不要・fire-and-forget。
 *
 * ※ IngressRoute では /api/v1/{generate,post,ingest,calendar/collage} だけ worker-front へ送り、
 *   それ以外は web へ。この計測は web pod のログに出る。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // UA はモバイル判別の補助になるのでサーバー側で付与（クライアントからは送らせない）。
    const ua = request.headers.get("user-agent") ?? "";
    console.warn("[upload-telemetry]", JSON.stringify({ ...body, ua }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
