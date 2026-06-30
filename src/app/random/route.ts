/**
 * ランダム表示エンドポイント
 * GET /random → 適当な公開画像の詳細ページ（/u/[username]/status/[imageId]）へリダイレクト。
 *
 * メニューの「ランダム」から飛んでくる動線。リンク先で毎回ランダムに1件選ぶため
 * force-dynamic + 307（非キャッシュ）でリダイレクトする。公開画像が0件なら /public へ。
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { userPathSegment } from "@/lib/userHandle";

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
  // 公開タイムラインと同じ可視条件（isPublic かつ管理者取り下げでない）
  const where = { isPublic: true, isDisabled: false } as const;

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

  const segment = userPathSegment(image.user.username, image.user.instance.domain);
  return redirectTo(`/u/${segment}/status/${image.id}`);
}
