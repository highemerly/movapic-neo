/**
 * 管理者によるモデレーション対応エンドポイント
 * POST /api/v1/admin/images/:id/moderate
 *
 * body: { action: "disable" | "delete" | "dismiss" }
 * - disable: 画像を非表示（isDisabled=true）にし、未対応通報を resolved にする
 * - delete:  画像を完全削除（S3 + DB）。通報は cascade で消える
 * - dismiss: 未対応通報を dismissed にする（画像は不変）
 *
 * 管理者以外には存在を隠すため 404 を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { deleteImage } from "@/lib/storage/storage";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";

type ModerateAction = "disable" | "restore" | "delete" | "dismiss";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    // 非管理者には存在を隠す（404）
    const acct = currentUser
      ? `${currentUser.username}@${currentUser.instance.domain}`
      : null;
    if (!isAdmin(acct)) {
      return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
    }

    const { id: imageId } = await params;

    const body = await request.json().catch(() => ({}));
    const action = body?.action as ModerateAction | undefined;
    if (
      action !== "disable" &&
      action !== "restore" &&
      action !== "delete" &&
      action !== "dismiss"
    ) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "action は disable / restore / delete / dismiss のいずれかを指定してください",
        400
      );
    }

    const image = await prisma.image.findUnique({
      where: { id: imageId },
      select: { id: true, storageKey: true, thumbnailKey: true },
    });

    if (!image) {
      return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
    }

    if (action === "delete") {
      // S3から削除（元画像とサムネイル）。失敗してもDB削除は続行（既存の削除フローと同方針）
      try {
        await deleteImage(image.storageKey);
        if (image.thumbnailKey) {
          await deleteImage(image.thumbnailKey);
        }
      } catch (error) {
        console.error("[moderate] S3削除に失敗:", error);
      }
      // 通報は onDelete: Cascade で消える
      await prisma.image.delete({ where: { id: imageId } });
      return NextResponse.json({ success: true, action });
    }

    if (action === "disable") {
      await prisma.$transaction([
        prisma.image.update({
          where: { id: imageId },
          data: { isDisabled: true },
        }),
        prisma.report.updateMany({
          where: { imageId, status: "open" },
          data: { status: "resolved", resolvedAt: new Date() },
        }),
      ]);
      return NextResponse.json({ success: true, action });
    }

    if (action === "restore") {
      // 公開に戻す（通報の status は resolved のまま）
      await prisma.image.update({
        where: { id: imageId },
        data: { isDisabled: false },
      });
      return NextResponse.json({ success: true, action });
    }

    // dismiss
    await prisma.report.updateMany({
      where: { imageId, status: "open" },
      data: { status: "dismissed", resolvedAt: new Date() },
    });
    return NextResponse.json({ success: true, action });
  } catch (error) {
    return handleUnknownError(error);
  }
}
