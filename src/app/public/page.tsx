import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { PublicTimelineClient } from "./PublicTimelineClient";
import { InstanceFilterBar } from "./InstanceFilterBar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { FloatingPostButton } from "@/components/FloatingPostButton";

// 動的レンダリングを強制
export const dynamic = "force-dynamic";

export default async function PublicTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ instances?: string }>;
}) {
  const currentUser = await getCurrentUser();

  // サーバー（インスタンス）絞り込み。カンマ区切りで複数指定可。
  const { instances: instancesParam } = await searchParams;
  const instanceDomains = instancesParam
    ? instancesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // 最新の公開画像を取得
  const images = await prisma.image.findMany({
    where: {
      isPublic: true,
      ...(instanceDomains.length > 0 && {
        user: { instance: { domain: { in: instanceDomains } } },
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
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
          instance: {
            select: {
              domain: true,
            },
          },
        },
      },
    },
  });

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  return (
    <>
      <SiteHeader user={currentUser ? { username: currentUser.username, instanceDomain: currentUser.instance.domain, avatarUrl: getAvatarUrl(currentUser.avatarUrl) } : null} />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-6xl">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold shrink-0">みんなの写真</h1>
          <InstanceFilterBar
            ownInstance={currentUser?.instance.domain ?? null}
            selected={instanceDomains[0] ?? null}
          />
        </div>

        <PublicTimelineClient
          // サーバー絞り込みが変わったら再マウントして state（images/cursor）を作り直す。
          // ソフトナビゲーションでは props は更新されるが useState は初期化されないため。
          key={instancesParam ?? "all"}
          initialImages={images.map((img: (typeof images)[number]) => ({
            id: img.id,
            storageKey: img.storageKey,
            width: img.width,
            height: img.height,
            overlayText: img.overlayText,
            position: img.position,
            favoriteCount: img.favoriteCount,
            createdAt: img.createdAt.toISOString(),
            user: {
              username: img.user.username,
              displayName: img.user.displayName,
              avatarUrl: getAvatarUrl(img.user.avatarUrl),
              instance: img.user.instance.domain,
            },
          }))}
          publicUrl={publicUrl}
          instancesParam={instancesParam ?? null}
        />

        <Footer />
      </div>
      <FloatingPostButton />
    </>
  );
}
