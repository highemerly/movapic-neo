/**
 * 画像一覧取得エンドポイント
 * GET /api/v1/images
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );

    const images = await prisma.image.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // 次のページがあるか確認するため+1
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      select: {
        id: true,
        storageKey: true,
        width: true,
        height: true,
        overlayText: true,
        createdAt: true,
      },
    });

    const hasMore = images.length > limit;
    const result = hasMore ? images.slice(0, -1) : images;
    const nextCursor = hasMore ? result[result.length - 1]?.id : null;

    return NextResponse.json({
      images: result.map((img) => ({
        ...img,
        createdAt: img.createdAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Failed to fetch images:", error);
    return NextResponse.json(
      { error: "画像の取得に失敗しました" },
      { status: 500 }
    );
  }
}
