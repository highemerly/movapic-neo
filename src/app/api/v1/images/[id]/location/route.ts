/**
 * 画像の位置情報削除エンドポイント
 * DELETE /api/v1/images/:id/location - 投稿後に位置情報のみを削除
 *
 * 投稿者本人のみ実行可能。locationPrefecture と locationCity を null 化する
 * （カメラ機種・撮影日時は残す）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
        suggestion: "ログインしてください",
      });
    }

    const { id: imageId } = await params;

    const image = await prisma.image.findUnique({
      where: { id: imageId },
      select: { userId: true, locationPrefecture: true, locationCity: true },
    });
    if (!image) {
      return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
    }
    if (image.userId !== currentUser.id) {
      return errorResponse(
        ErrorCodes.FORBIDDEN,
        "自分の画像のみ操作できます",
        403
      );
    }
    if (!image.locationPrefecture && !image.locationCity) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "位置情報は登録されていません",
        404
      );
    }

    await prisma.image.update({
      where: { id: imageId },
      data: { locationPrefecture: null, locationCity: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUnknownError(error);
  }
}
