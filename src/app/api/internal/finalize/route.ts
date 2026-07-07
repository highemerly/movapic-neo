/**
 * 内部API: 最終画像の mime 判定＋寸法＋サムネ生成（compute 専用・外部Ingressなし）
 * POST /api/internal/finalize
 *
 * worker-front から呼ばれる。sharp による処理はここ（compute）でのみ実行する。
 * in: multipart（image + position）
 * out: サムネ webp binary ＋ ヘッダ（X-Detected-Mime / X-Width / X-Height）
 *   - X-Detected-Mime: JPEG/AVIF のときのみ "image/jpeg"|"image/avif"、それ以外は空文字
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyComputeApiKey } from "@/lib/compute/internalAuth";
import { Position, isValidPosition } from "@/types";

// sharp の Metadata から必要なフィールドだけを構造的に受ける（sharp 型を import しないことで
// このモジュールの評価時に native を引かない＝boot 時の web/worker-front を native フリーに保つ）。
type ImageMeta = {
  width?: number;
  height?: number;
  format?: string;
  compression?: string;
};

/**
 * 画像メタデータから、R2 に保存して良い Content-Type を返す。
 * /api/v1/generate の出力（JPEG / AVIF）のみ許可。
 * sharp 0.30+ は AVIF を format='heif', compression='av1' として返す（libheif 経由）。
 */
function detectSafeMimeType(metadata: ImageMeta): string | undefined {
  if (metadata.format === "jpeg") return "image/jpeg";
  if (metadata.format === "avif") return "image/avif";
  if (metadata.format === "heif" && metadata.compression === "av1") {
    return "image/avif";
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  if (!verifyComputeApiKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const image = form.get("image") as File | null;
  const position = form.get("position") as Position | null;

  if (!image || !isValidPosition(position)) {
    return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
  }

  const imageBuffer = Buffer.from(await image.arrayBuffer());

  // sharp/thumbnail は「ハンドラ実行時」にだけ動的ロードする。top-level import にすると
  // Next.js が起動時に全ルートモジュールを評価する際、web/worker-front でも libvips が
  // 常駐してしまうため（compute でのみロードさせる）。
  const sharp = (await import("sharp")).default;
  const { generateThumbnail } = await import("@/lib/thumbnail");

  let metadata: ImageMeta;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch {
    return NextResponse.json({ error: "画像の解析に失敗しました" }, { status: 400 });
  }

  const detectedMime = detectSafeMimeType(metadata) ?? "";

  try {
    const thumbnail = await generateThumbnail(imageBuffer, position);
    // 一覧のBlurプレースホルダ用 LQIP。同じ最終画像を32pxのWebPに縮小した data URI を
    // ヘッダで返す（~1KB以内・失敗しても本処理は止めない＝null相当）。
    const { computeBlurDataUrl } = await import("@/lib/blurData");
    const blurDataUrl = await computeBlurDataUrl(sharp, imageBuffer);
    return new NextResponse(new Uint8Array(thumbnail), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "X-Detected-Mime": detectedMime,
        "X-Width": String(metadata.width || 0),
        "X-Height": String(metadata.height || 0),
        ...(blurDataUrl ? { "X-Blur-Data": blurDataUrl } : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[internal/finalize] failed:", error);
    return NextResponse.json({ error: "finalize failed" }, { status: 500 });
  }
}
