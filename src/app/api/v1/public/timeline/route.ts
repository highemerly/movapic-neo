/**
 * パブリックタイムラインエンドポイント
 * GET /api/v1/public/timeline
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAvatarUrl } from "@/lib/avatar";
import { parsePageLimit, cursorPageArgs, slicePage } from "@/lib/pagination";
import { CACHE_PUBLIC_SHORT } from "@/lib/http";
import { PUBLIC_IMAGE_LIST_SELECT } from "@/lib/db/selects";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = parsePageLimit(searchParams.get("limit"));

    // サーバー（インスタンス）絞り込み。カンマ区切りで複数指定可。
    const instancesParam = searchParams.get("instances");
    const instanceDomains = instancesParam
      ? instancesParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const images = await prisma.image.findMany({
      where: {
        isPublic: true,
        isDisabled: false,
        ...(instanceDomains.length > 0 && {
          user: { instance: { domain: { in: instanceDomains } } },
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...cursorPageArgs(cursor, limit),
      select: PUBLIC_IMAGE_LIST_SELECT,
    });

    const { result, hasMore, nextCursor } = slicePage(images, limit);

    return NextResponse.json(
      {
        images: result.map((img: (typeof result)[number]) => ({
          id: img.id,
          storageKey: img.storageKey,
          width: img.width,
          height: img.height,
          overlayText: img.overlayText,
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
        })),
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
