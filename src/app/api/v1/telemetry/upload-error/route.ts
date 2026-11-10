import { NextRequest, NextResponse } from "next/server";
import {
  MAX_UPLOAD_FAILURE_REPORT_BYTES,
  sanitizeUploadFailureReport,
} from "@/lib/uploadTelemetry";

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
/**
 * 本文を上限まで読む。超えたら null（読むのをやめる）。
 * Content-Length だけに頼らないのは、途中の経路（CDN・イングレス）で chunked に変わると
 * 申告が無くなり、正規の報告まで弾いてしまうため。
 */
async function readBodyWithin(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const text = await readBodyWithin(request, MAX_UPLOAD_FAILURE_REPORT_BYTES);
    if (text === null) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    const report = sanitizeUploadFailureReport(parseJson(text));
    if (!report) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // UA はモバイル判別の補助になるのでサーバー側で付与（クライアントからは送らせない）。
    const ua = (request.headers.get("user-agent") ?? "").slice(0, 512);
    console.warn("[upload-telemetry]", JSON.stringify({ ...report, ua }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
