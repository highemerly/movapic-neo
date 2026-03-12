/**
 * お気に入り一覧エンドポイント
 * GET /api/v1/favorites
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );

    const favorites = await prisma.favorite.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      select: {
        id: true,
        createdAt: true,
        image: {
          select: {
            id: true,
            storageKey: true,
            width: true,
            height: true,
            overlayText: true,
            position: true,
            favoriteCount: true,
            createdAt: true,
            user: {
              select: {
                username: true,
                displayName: true,
                avatarUrl: true,
                instance: {
                  select: {
                    domain: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const hasMore = favorites.length > limit;
    const result = hasMore ? favorites.slice(0, -1) : favorites;
    const nextCursor = hasMore ? result[result.length - 1]?.id : null;

    return NextResponse.json({
      images: result.map((fav) => ({
        id: fav.image.id,
        storageKey: fav.image.storageKey,
        width: fav.image.width,
        height: fav.image.height,
        overlayText: fav.image.overlayText,
        position: fav.image.position,
        favoriteCount: fav.image.favoriteCount,
        createdAt: fav.image.createdAt.toISOString(),
        favoritedAt: fav.createdAt.toISOString(),
        user: {
          username: fav.image.user.username,
          displayName: fav.image.user.displayName,
          avatarUrl: fav.image.user.avatarUrl,
          instance: fav.image.user.instance.domain,
        },
      })),
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Failed to fetch favorites:", error);
    return NextResponse.json(
      { error: "お気に入りの取得に失敗しました" },
      { status: 500 }
    );
  }
}
