/**
 * ランダム表示エンドポイント
 * GET /random → 適当な公開画像の詳細ページ（/u/[username]/status/[imageId]）へリダイレクト。
 *
 * メニューの「ランダム」から飛んでくる動線。リンク先で毎回ランダムに1件選ぶため
 * force-dynamic + 307（非キャッシュ）でリダイレクトする。公開画像が0件なら /public へ。
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveMutedUserIds } from "@/lib/mutes";
import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// 相対パスの Location ヘッダーでリダイレクトする。
// NextResponse.redirect は絶対URLを要求し new URL(path, request.url) を使うと
// request.url のホスト（dev では localhost になりがち）に飛ばされてしまうため、
// 相対パスを返してブラウザ側に現在のホスト基準で解決させる。
function redirectTo(path: string) {
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: path,
      // リダイレクト自体をブラウザ／CDN にキャッシュさせない（毎回ランダムに選ぶため）
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  // ミュートは通常クライアント側で除外するが、ランダムはリダイレクト先をサーバーが
  // 1件選んで決めるため表示側で弾く余地がない。ここだけサーバー側で notIn 除外する。
  const currentUser = await getCurrentUser();
  const mutedUserIds = currentUser
    ? await getActiveMutedUserIds(currentUser.id)
    : [];

  // 公開タイムラインと同じ可視条件（isPublic かつ管理者取り下げでない）＋ミュート除外
  const where: Prisma.ImageWhereInput = {
    isPublic: true,
    isDisabled: false,
    ...(mutedUserIds.length > 0 && { userId: { notIn: mutedUserIds } }),
  };

  const totalCount = await prisma.image.count({ where });
  if (totalCount === 0) {
    return redirectTo("/public");
  }

  // ランダムなオフセットで1件取得（featured エンドポイントと同方式）
  const randomOffset = Math.floor(Math.random() * totalCount);
  const image = await prisma.image.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    skip: randomOffset,
    select: {
      id: true,
      user: {
        select: {
          username: true,
          instance: { select: { domain: true } },
        },
      },
    },
  });

  if (!image) {
    return redirectTo("/public");
  }

  const segment = userPathSegment(image.user.username, image.user.instance.domain, getHomeServer());
  return redirectTo(`/u/${segment}/status/${image.id}`);
}
