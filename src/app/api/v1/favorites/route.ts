/**
 * お気に入り一覧エンドポイント（best-effort）
 * GET /api/v1/favorites
 *
 * Mastodonが正データのため「自分がお気に入りした画像」を正確に出す手段はない。
 * favoritersCache（オーナーインスタンスから取得した上位40件）に自分のacctが
 * 含まれる画像をbest-effortで一覧する。人気投稿で上位40件外の自分のfavは出ない。
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { getAvatarUrl } from "@/lib/avatar";
import { parsePageLimit, cursorPageArgs, slicePage } from "@/lib/pagination";
import { PUBLIC_IMAGE_LIST_SELECT } from "@/lib/db/selects";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = parsePageLimit(searchParams.get("limit"));

    const viewerAcct = `${currentUser.username}@${currentUser.instance.domain}`;

    const images = await prisma.image.findMany({
      where: {
        isPublic: true,
        isDisabled: false,
        favoritersCache: {
          array_contains: [{ acct: viewerAcct }] as Prisma.InputJsonValue,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...cursorPageArgs(cursor, limit),
      select: PUBLIC_IMAGE_LIST_SELECT,
    });

    const { result, hasMore, nextCursor } = slicePage(images, limit);

    return NextResponse.json({
      images: result.map((image) => ({
        id: image.id,
        storageKey: image.storageKey,
        width: image.width,
        height: image.height,
        overlayText: image.overlayText,
        altText: image.altText,
        position: image.position,
        size: image.size,
        blurDataUrl: image.blurDataUrl,
        favoriteCount: image.favoriteCount,
        createdAt: image.createdAt.toISOString(),
        user: {
          username: image.user.username,
          displayName: image.user.displayName,
          avatarUrl: getAvatarUrl(image.user.avatarUrl),
          instance: image.user.instance.domain,
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
