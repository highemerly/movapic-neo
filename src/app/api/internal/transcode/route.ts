/**
 * 内部API: 保存済み生成画像の形式変換（compute 専用・外部Ingressなし）
 * POST /api/internal/transcode
 *
 * worker-front から呼ばれる。sharp による処理はここ（compute）でのみ実行する。
 * in: multipart（image + format）— format は現状 "jpeg" のみ
 * out: 変換後の binary（Content-Type は変換後の形式）
 *
 * 用途は Mastodon へのアップロード（AVIF を受け取れないため JPEG に変換する）。
 * 変換結果は保存しない＝SHAMEZO 側の保存物は AVIF のまま（src/lib/fediverse/uploadFormat.ts）。
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyComputeApiKey } from "@/lib/compute/internalAuth";

export async function POST(request: NextRequest) {
  if (!verifyComputeApiKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const image = form.get("image") as File | null;
  const format = form.get("format") as string | null;

  if (!image || format !== "jpeg") {
    return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
  }

  const imageBuffer = Buffer.from(await image.arrayBuffer());

  // sharp は「ハンドラ実行時」にだけ動的ロードする。top-level import にすると
  // Next.js が起動時に全ルートモジュールを評価する際、web/worker-front でも libvips が
  // 常駐してしまうため（compute でのみロードさせる）。
  const { toUploadJpeg } = await import("@/lib/image/format");

  try {
    const converted = await toUploadJpeg(imageBuffer);
    return new NextResponse(new Uint8Array(converted), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(converted.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[internal/transcode] failed:", error);
    return NextResponse.json({ error: "transcode failed" }, { status: 500 });
  }
}
