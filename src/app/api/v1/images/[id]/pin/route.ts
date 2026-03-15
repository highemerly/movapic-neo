/**
 * ピン留めエンドポイント
 * POST /api/v1/images/:id/pin - ピン留め
 * DELETE /api/v1/images/:id/pin - ピン留め解除
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";

const MAX_PINNED_IMAGES = 4;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return errorResponse(
        ErrorCodes.AUTH_REQUIRED,
        "認証が必要です",
        401,
        { suggestion: "ログインしてください" }
      );
    }

    const { id: imageId } = await params;

    // 画像の存在確認と所有権チェック
    const image = await prisma.image.findUnique({
      where: { id: imageId },
      select: { userId: true, pinnedAt: true },
    });

    if (!image) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "画像が見つかりません",
        404
      );
    }

    // 自分の画像でなければエラー
    if (image.userId !== currentUser.id) {
      return errorResponse(
        ErrorCodes.FORBIDDEN,
        "自分の画像のみピン留めできます",
        403
      );
    }

    // 既にピン留め済みか確認
    if (image.pinnedAt) {
      return errorResponse(
        ErrorCodes.CONFLICT,
        "既にピン留め済みです",
        409
      );
    }

    // 現在のピン留め数を確認
    const pinnedCount = await prisma.image.count({
      where: {
        userId: currentUser.id,
        pinnedAt: { not: null },
      },
    });

    if (pinnedCount >= MAX_PINNED_IMAGES) {
      return errorResponse(
        ErrorCodes.CONFLICT,
        `ピン留めは最大${MAX_PINNED_IMAGES}つまでです`,
        409,
        { suggestion: "他のピン留めを解除してください" }
      );
    }

    // ピン留め
    const updatedImage = await prisma.image.update({
      where: { id: imageId },
      data: { pinnedAt: new Date() },
      select: { pinnedAt: true },
    });

    return NextResponse.json({
      success: true,
      pinnedAt: updatedImage.pinnedAt?.toISOString(),
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return errorResponse(
        ErrorCodes.AUTH_REQUIRED,
        "認証が必要です",
        401,
        { suggestion: "ログインしてください" }
      );
    }

    const { id: imageId } = await params;

    // 画像の存在確認と所有権チェック
    const image = await prisma.image.findUnique({
      where: { id: imageId },
      select: { userId: true, pinnedAt: true },
    });

    if (!image) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "画像が見つかりません",
        404
      );
    }

    // 自分の画像でなければエラー
    if (image.userId !== currentUser.id) {
      return errorResponse(
        ErrorCodes.FORBIDDEN,
        "自分の画像のみ操作できます",
        403
      );
    }

    // ピン留めされていなければエラー
    if (!image.pinnedAt) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "ピン留めされていません",
        404
      );
    }

    // ピン留め解除
    await prisma.image.update({
      where: { id: imageId },
      data: { pinnedAt: null },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
