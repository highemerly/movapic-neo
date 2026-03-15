/**
 * ユーザーの公開画像一覧エンドポイント
 * GET /api/v1/public/users/:username/images
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    // ユーザーを取得（handon.club限定）
    const user = await prisma.user.findFirst({
      where: {
        username,
        instance: {
          domain: process.env.MASTODON_INSTANCE || "handon.club",
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );

    // 日付フィルタを構築
    const dateFilter: { gte?: Date; lt?: Date } = {};
    if (startDateParam) {
      const startDate = new Date(startDateParam);
      if (!isNaN(startDate.getTime())) {
        dateFilter.gte = startDate;
      }
    }
    if (endDateParam) {
      const endDate = new Date(endDateParam);
      if (!isNaN(endDate.getTime())) {
        dateFilter.lt = endDate;
      }
    }

    const images = await prisma.image.findMany({
      where: {
        userId: user.id,
        isPublic: true,
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      select: {
        id: true,
        storageKey: true,
        thumbnailKey: true,
        width: true,
        height: true,
        overlayText: true,
        position: true,
        favoriteCount: true,
        pinnedAt: true,
        createdAt: true,
      },
    });

    const hasMore = images.length > limit;
    const result = hasMore ? images.slice(0, -1) : images;
    const nextCursor = hasMore ? result[result.length - 1]?.id : null;

    return NextResponse.json(
      {
        images: result.map((img: (typeof result)[number]) => ({
          ...img,
          pinnedAt: img.pinnedAt?.toISOString() ?? null,
          createdAt: img.createdAt.toISOString(),
        })),
        nextCursor,
        hasMore,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch user images:", error);
    return NextResponse.json(
      { error: "画像の取得に失敗しました" },
      { status: 500 }
    );
  }
}
