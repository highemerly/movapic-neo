/**
 * パブリックタイムラインエンドポイント
 * GET /api/v1/public/timeline
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { getAvatarUrl } from "@/lib/avatar";
import {
  parsePageLimit,
  cursorPageArgs,
  slicePage,
  sliceSincePage,
} from "@/lib/pagination";
import { CACHE_PUBLIC_SHORT } from "@/lib/http";
import { PUBLIC_IMAGE_LIST_SELECT } from "@/lib/db/selects";

type TimelineRow = Prisma.ImageGetPayload<{ select: typeof PUBLIC_IMAGE_LIST_SELECT }>;

function toDto(img: TimelineRow) {
  return {
    id: img.id,
    storageKey: img.storageKey,
    width: img.width,
    height: img.height,
    overlayText: img.overlayText,
    altText: img.altText,
    position: img.position,
    size: img.size,
    blurDataUrl: img.blurDataUrl,
    favoriteCount: img.favoriteCount,
    createdAt: img.createdAt.toISOString(),
    user: {
      username: img.user.username,
      displayName: img.user.displayName,
      avatarUrl: getAvatarUrl(img.user.avatarUrl),
      instance: img.user.instance.domain,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    // since（先頭に表示中の最新 id）指定時は差分ロード＝それより新しい画像だけ返す。
    const since = searchParams.get("since");
    const limit = parsePageLimit(searchParams.get("limit"));

    // サーバー（インスタンス）絞り込み。カンマ区切りで複数指定可。
    const instancesParam = searchParams.get("instances");
    const instanceDomains = instancesParam
      ? instancesParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const where = {
      isPublic: true,
      isDisabled: false,
      ...(instanceDomains.length > 0 && {
        user: { instance: { domain: { in: instanceDomains } } },
      }),
    };

    // since 指定時は「より新しい」を昇順カーソルで取り、sliceSincePage で新しい順へ戻す。
    const orderBy: Prisma.ImageOrderByWithRelationInput[] = since
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

    const images = await prisma.image.findMany({
      where,
      orderBy,
      ...cursorPageArgs(since ?? cursor, limit),
      select: PUBLIC_IMAGE_LIST_SELECT,
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
    console.error("Failed to fetch timeline:", error);
    return NextResponse.json(
      { error: "タイムラインの取得に失敗しました" },
      { status: 500 }
    );
  }
}
