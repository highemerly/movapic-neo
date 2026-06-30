/**
 * 内部API: 文字入れ画像の生成（compute 専用・外部Ingressなし）
 * POST /api/internal/render
 *
 * worker-front から呼ばれる。skia/sharp による重い処理はここ（compute）でのみ実行する。
 * in: multipart（image + text/position/color/size/font/output/arrangement[+season][+requestId]）
 *   season を渡した場合は position/color/size/font/arrangement は不要（プリセットで上書きするため無視）。
 *   期間チェックは worker-front 側の責務。compute は season キーの妥当性のみ確認する。
 * out: 生成画像 binary ＋ メタはヘッダ（Content-Type / X-Extension / X-Original-Width/Height）
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyComputeApiKey } from "@/lib/compute/internalAuth";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
  DEFAULT_POSITION,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_FONT,
  isValidPosition,
  isValidFont,
  isValidColor,
  isValidSize,
  isValidOutput,
  isValidArrangement,
} from "@/types";
import { getSeasonByKey } from "@/lib/seasons/catalog";

export async function POST(request: NextRequest) {
  if (!verifyComputeApiKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const image = form.get("image") as File | null;
  const text = form.get("text") as string | null;
  const output = form.get("output") as OutputFormat | null;
  const season = (form.get("season") as string | null) || null;
  const requestId = (form.get("requestId") as string | null) || undefined;

  // image / text / output は常に必須。
  if (!image || !text || !isValidOutput(output)) {
    return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
  }

  // スタイル系オプション。season 指定時はプリセットで上書きされるため検証不要
  // （processImage がプリセットへ差し替える）。中立デフォルトを渡しておく。
  let position: Position;
  let color: Color;
  let size: Size;
  let font: FontFamily;
  let arrangement: Arrangement;

  if (season) {
    // season キーの妥当性のみ確認（期間判定は worker-front 側で済んでいる）。
    if (!getSeasonByKey(season)) {
      return NextResponse.json({ error: "invalid season" }, { status: 400 });
    }
    position = DEFAULT_POSITION;
    color = DEFAULT_COLOR;
    size = DEFAULT_SIZE;
    font = DEFAULT_FONT;
    arrangement = "none";
  } else {
    const p = form.get("position") as Position | null;
    const c = form.get("color") as Color | null;
    const s = form.get("size") as Size | null;
    const f = form.get("font") as FontFamily | null;
    const a = (form.get("arrangement") as Arrangement | null) || "none";
    if (
      !isValidPosition(p) ||
      !isValidColor(c) ||
      !isValidSize(s) ||
      !isValidFont(f) ||
      !isValidArrangement(a)
    ) {
      return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
    }
    position = p;
    color = c;
    size = s;
    font = f;
    arrangement = a;
  }

  const imageBuffer = Buffer.from(await image.arrayBuffer());

  try {
    // sharp/skia は「ハンドラ実行時」にだけ動的ロードする。top-level import にすると
    // Next.js が起動時に全ルートモジュールを評価する際、web/worker-front でも
    // libvips/skia が常駐してしまうため（compute でのみロードさせる）。
    const { processImage } = await import("@/lib/imageProcessor");
    const result = await processImage({
      imageBuffer,
      text,
      position,
      color,
      size,
      font,
      output,
      arrangement,
      season,
      requestId,
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "X-Extension": result.extension,
        "X-Original-Width": String(result.originalWidth || 0),
        "X-Original-Height": String(result.originalHeight || 0),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[internal/render] failed:", error);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
