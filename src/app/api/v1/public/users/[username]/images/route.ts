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
    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );

    const images = await prisma.image.findMany({
      where: {
        userId: user.id,
        isPublic: true,
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
      images: result.map((img: (typeof result)[number]) => ({
        ...img,
        createdAt: img.createdAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error("Failed to fetch user images:", error);
    return NextResponse.json(
      { error: "画像の取得に失敗しました" },
      { status: 500 }
    );
  }
}
