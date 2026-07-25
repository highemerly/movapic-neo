/**
 * リアクションした画像の一覧エンドポイント
 * GET /api/v1/favorites
 *
 * 情報源は2つ:
 *  - Reaction テーブル … SHAMEZO 上で押したリアクション。件数に関わらず確実に出る
 *  - favoritersCache … Fediverse 側（Misskeyのリアクション / Mastodonのお気に入り）で
 *    直接押したぶん。オーナーインスタンス由来の上位40件なので、人気投稿で40件外に
 *    なったものは出ない（best-effort）
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
        OR: [
          { reactions: { some: { userId: currentUser.id } } },
          {
            favoritersCache: {
              array_contains: [{ acct: viewerAcct }] as Prisma.InputJsonValue,
            },
          },
        ],
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
