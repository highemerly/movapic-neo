/**
 * フィーチャー画像取得エンドポイント（ランダム）
 * GET /api/v1/public/featured
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "6", 10), 1), 12);

    // 公開画像の総数を取得
    const totalCount = await prisma.image.count({
      where: { isPublic: true },
    });

    if (totalCount === 0) {
      return NextResponse.json({ images: [] });
    }

    // ランダムなオフセットを計算
    const maxOffset = Math.max(0, totalCount - limit);
    const randomOffset = Math.floor(Math.random() * (maxOffset + 1));

    // ランダムな位置から画像を取得
    const images = await prisma.image.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      skip: randomOffset,
      take: limit,
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

    // シャッフル
    const shuffled = images.sort(() => Math.random() - 0.5);

    return NextResponse.json({
      images: shuffled.map((img: (typeof shuffled)[number]) => ({
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
    });
  } catch (error) {
    console.error("Failed to fetch featured images:", error);
    return NextResponse.json(
      { error: "画像の取得に失敗しました" },
      { status: 500 }
    );
  }
}
