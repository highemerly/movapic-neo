/**
 * 内部API: カレンダー画像（コラージュ）の生成（compute 専用・外部Ingressなし）
 * POST /api/internal/render-calendar
 *
 * worker-front から呼ばれる。skia/sharp による描画・エンコードはここ（compute）でのみ実行する。
 * in: multipart
 *   - spec: CalendarCollageSpec の JSON 文字列（year/month/serviceName/appDomain/authorHandle/isPerfect/holidays/cells）
 *   - thumb_0, thumb_1, ...: 各セルのサムネ画像（cells[].imageIndex が対応）
 * out: 生成画像 binary（JPEG）＋ メタはヘッダ（Content-Type / X-Width / X-Height）
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyComputeApiKey } from "@/lib/compute/internalAuth";
import type { CalendarCollageSpec } from "@/lib/calendar/collageTypes";

function isValidSpec(spec: unknown): spec is CalendarCollageSpec {
  if (!spec || typeof spec !== "object") return false;
  const s = spec as Record<string, unknown>;
  return (
    typeof s.year === "number" &&
    typeof s.month === "number" &&
    s.month >= 1 &&
    s.month <= 12 &&
    typeof s.serviceName === "string" &&
    typeof s.appDomain === "string" &&
    typeof s.authorHandle === "string" &&
    typeof s.isPerfect === "boolean" &&
    Array.isArray(s.holidays) &&
    Array.isArray(s.cells)
  );
}

export async function POST(request: NextRequest) {
  if (!verifyComputeApiKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const specRaw = form.get("spec") as string | null;
  if (!specRaw) {
    return NextResponse.json({ error: "missing spec" }, { status: 400 });
  }

  let spec: CalendarCollageSpec;
  try {
    const parsed = JSON.parse(specRaw);
    if (!isValidSpec(parsed)) {
      return NextResponse.json({ error: "invalid spec" }, { status: 400 });
    }
    spec = parsed;
  } catch {
    return NextResponse.json({ error: "invalid spec json" }, { status: 400 });
  }

  // サムネ画像をインデックス順に集める（thumb_0..thumb_{n-1}）。
  const thumbnails: Buffer[] = [];
  for (let i = 0; ; i++) {
    const file = form.get(`thumb_${i}`) as File | null;
    if (!file) break;
    thumbnails.push(Buffer.from(await file.arrayBuffer()));
  }

  try {
    // skia/sharp は「ハンドラ実行時」にだけ動的ロードする（compute でのみ常駐させる）。
    const { renderCalendarCollage } = await import("@/lib/image/calendarCollage");
    const result = await renderCalendarCollage(spec, thumbnails);

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "X-Width": String(result.width),
        "X-Height": String(result.height),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[internal/render-calendar] failed:", error);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
