/**
 * ユーザーの公開画像一覧エンドポイント
 * GET /api/v1/public/users/:username/images
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { parseUserHandle } from "@/lib/userHandle";
import {
  parsePageLimit,
  cursorPageArgs,
  slicePage,
  sliceSincePage,
} from "@/lib/pagination";
import { CACHE_PUBLIC_SHORT } from "@/lib/http";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    // ユーザーを取得（username@domain で解決。domain 省略時は既定インスタンス）
    const { username: cleanUsername, domain } = parseUserHandle(username);
    const user = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
        instance: {
          domain,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    // since（先頭に表示中の最新 id）指定時は差分ロード＝それより新しい画像だけ返す。
    const since = searchParams.get("since");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const limit = parsePageLimit(searchParams.get("limit"));

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

    // since 指定時は「より新しい」を昇順カーソルで取り、sliceSincePage で新しい順へ戻す。
    const orderBy: Prisma.ImageOrderByWithRelationInput[] = since
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

    const images = await prisma.image.findMany({
      where: {
        userId: user.id,
        isPublic: true,
        isDisabled: false,
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      },
      orderBy,
      ...cursorPageArgs(since ?? cursor, limit),
      select: {
        id: true,
        storageKey: true,
        thumbnailKey: true,
        width: true,
        height: true,
        overlayText: true,
        position: true,
        size: true,
        blurDataUrl: true,
        favoriteCount: true,
        pinnedAt: true,
        createdAt: true,
      },
    });

    const toDto = (img: (typeof images)[number]) => ({
      ...img,
      pinnedAt: img.pinnedAt?.toISOString() ?? null,
      createdAt: img.createdAt.toISOString(),
    });

    if (since) {
      const { result, gap } = sliceSincePage(images, limit);
      return NextResponse.json(
        { images: result.map(toDto), gap },
        { headers: { "Cache-Control": CACHE_PUBLIC_SHORT } }
      );
    }

    const { result, hasMore, nextCursor } = slicePage(images, limit);

    return NextResponse.json(
      {
        images: result.map(toDto),
        nextCursor,
        hasMore,
      },
      {
        headers: {
          "Cache-Control": CACHE_PUBLIC_SHORT,
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
