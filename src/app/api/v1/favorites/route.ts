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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );

    const viewerAcct = `${currentUser.username}@${currentUser.instance.domain}`;

    const images = await prisma.image.findMany({
      where: {
        isPublic: true,
        favoritersCache: {
          array_contains: [{ acct: viewerAcct }] as Prisma.InputJsonValue,
        },
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
        position: true,
        favoriteCount: true,
        createdAt: true,
        user: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            instance: { select: { domain: true } },
          },
        },
      },
    });

    const hasMore = images.length > limit;
    const result = hasMore ? images.slice(0, -1) : images;
    const nextCursor = hasMore ? result[result.length - 1]?.id : null;

    return NextResponse.json({
      images: result.map((image) => ({
        id: image.id,
        storageKey: image.storageKey,
        width: image.width,
        height: image.height,
        overlayText: image.overlayText,
        position: image.position,
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
