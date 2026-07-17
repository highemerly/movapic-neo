/**
 * ユーザーの公開画像一覧エンドポイント
 * GET /api/v1/public/users/:username/images
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { parseUserHandle } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
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

    // ユーザーを取得（username@domain で解決。domain 省略はホームインスタンスのみ）
    const parsed = parseUserHandle(username, getHomeServer());
    const user = parsed
      ? await prisma.user.findFirst({
          where: {
            username: parsed.username,
            instance: { domain: parsed.domain },
          },
        })
      : null;

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

    const imageSelect = {
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
    } as const;

    type ImageRow = Prisma.ImageGetPayload<{ select: typeof imageSelect }>;
    const toDto = (img: ImageRow) => ({
      ...img,
      pinnedAt: img.pinnedAt?.toISOString() ?? null,
      createdAt: img.createdAt.toISOString(),
    });

    // タイムライン先頭（cursor/since/日付フィルタなし）はピン留めを先頭に集約して返す。
    // SSR(photos/page.tsx)は先頭集約するが、クライアント再取得(reconcile)で使うこの API が
    // createdAt 降順のみだと、最新 limit 件に入らない古いピン留めが reconcileTimeline の
    // tail 切り捨てで脱落する（pitfall: 複数ピン留めしても1件しか残らない）。
    const isTimelineHead =
      !cursor && !since && Object.keys(dateFilter).length === 0;
    if (isTimelineHead) {
      const pinned = await prisma.image.findMany({
        where: {
          userId: user.id,
          isPublic: true,
          isDisabled: false,
          pinnedAt: { not: null },
        },
        orderBy: { pinnedAt: "desc" },
        select: imageSelect,
      });
      const pinnedIds = pinned.map((img) => img.id);
      const recentRaw = await prisma.image.findMany({
        where: {
          userId: user.id,
          isPublic: true,
          isDisabled: false,
          id: { notIn: pinnedIds },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: imageSelect,
      });
      const { result, hasMore, nextCursor } = slicePage(recentRaw, limit);
      return NextResponse.json(
        {
          images: [...pinned, ...result].map(toDto),
          nextCursor,
          hasMore,
        },
        { headers: { "Cache-Control": CACHE_PUBLIC_SHORT } }
      );
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
      select: imageSelect,
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
