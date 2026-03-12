import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { PublicTimelineClient } from "./PublicTimelineClient";
import { SiteHeader } from "@/components/layout/SiteHeader";

// 動的レンダリングを強制
export const dynamic = "force-dynamic";

export default async function PublicTimelinePage() {
  const currentUser = await getCurrentUser();

  // 最新の公開画像を取得
  const images = await prisma.image.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
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

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  return (
    <>
      <SiteHeader user={currentUser ? { username: currentUser.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-2xl font-bold mb-8">タイムライン</h1>

        <PublicTimelineClient
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
              avatarUrl: img.user.avatarUrl,
              instance: img.user.instance.domain,
            },
          }))}
          publicUrl={publicUrl}
        />
      </div>
    </>
  );
}
