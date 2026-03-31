/**
 * お気に入りエンドポイント
 * GET /api/v1/images/:id/favorite - お気に入り状態取得
 * POST /api/v1/images/:id/favorite - お気に入り登録
 * DELETE /api/v1/images/:id/favorite - お気に入り解除
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: imageId } = await params;
    const currentUser = await getCurrentUser();

    // 画像の存在確認
    const image = await prisma.image.findUnique({
      where: { id: imageId, isPublic: true },
      select: { favoriteCount: true },
    });

    if (!image) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "画像が見つかりません",
        404
      );
    }

    // ログインユーザーのお気に入り状態を確認
    let isFavorited = false;
    if (currentUser) {
      const favorite = await prisma.favorite.findUnique({
        where: {
          userId_imageId: {
            userId: currentUser.id,
            imageId,
          },
        },
      });
      isFavorited = !!favorite;
    }

    // 最近のお気に入り登録者（最大5人）
    const recentFavoriters = await prisma.favorite.findMany({
      where: { imageId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      favoriteCount: image.favoriteCount,
      isFavorited,
      recentFavoriters: recentFavoriters.map((f) => ({
        username: f.user.username,
        displayName: f.user.displayName,
        avatarUrl: f.user.avatarUrl,
      })),
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

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

    // 画像の存在確認（公開画像のみ）
    const image = await prisma.image.findUnique({
      where: { id: imageId, isPublic: true },
    });

    if (!image) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "画像が見つかりません",
        404
      );
    }

    // 既にお気に入り登録済みか確認
    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_imageId: {
          userId: currentUser.id,
          imageId,
        },
      },
    });

    if (existingFavorite) {
      return errorResponse(
        ErrorCodes.CONFLICT,
        "既にお気に入り登録済みです",
        409
      );
    }

    // トランザクションでお気に入り登録とカウント更新
    const result = await prisma.$transaction(async (tx) => {
      await tx.favorite.create({
        data: {
          userId: currentUser.id,
          imageId,
        },
      });

      const updatedImage = await tx.image.update({
        where: { id: imageId },
        data: { favoriteCount: { increment: 1 } },
        select: { favoriteCount: true },
      });

      return updatedImage;
    });

    return NextResponse.json({
      success: true,
      favoriteCount: result.favoriteCount,
      isFavorited: true,
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

    // お気に入り登録の存在確認
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_imageId: {
          userId: currentUser.id,
          imageId,
        },
      },
    });

    if (!favorite) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "お気に入り登録されていません",
        404
      );
    }

    // トランザクションでお気に入り解除とカウント更新
    const result = await prisma.$transaction(async (tx) => {
      await tx.favorite.delete({
        where: {
          userId_imageId: {
            userId: currentUser.id,
            imageId,
          },
        },
      });

      const updatedImage = await tx.image.update({
        where: { id: imageId },
        data: { favoriteCount: { decrement: 1 } },
        select: { favoriteCount: true },
      });

      return updatedImage;
    });

    return NextResponse.json({
      success: true,
      favoriteCount: result.favoriteCount,
      isFavorited: false,
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
