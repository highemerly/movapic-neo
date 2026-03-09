/**
 * パブリックタイムラインエンドポイント
 * GET /api/v1/public/timeline
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );

    const images = await prisma.image.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
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
    });

    const hasMore = images.length > limit;
    const result = hasMore ? images.slice(0, -1) : images;
    const nextCursor = hasMore ? result[result.length - 1]?.id : null;

    return NextResponse.json({
      images: result.map((img) => ({
        id: img.id,
        storageKey: img.storageKey,
        width: img.width,
        height: img.height,
        overlayText: img.overlayText,
        createdAt: img.createdAt.toISOString(),
        user: {
          username: img.user.username,
          displayName: img.user.displayName,
          avatarUrl: img.user.avatarUrl,
          instance: img.user.instance.domain,
        },
      })),
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Failed to fetch timeline:", error);
    return NextResponse.json(
      { error: "タイムラインの取得に失敗しました" },
      { status: 500 }
    );
  }
}
