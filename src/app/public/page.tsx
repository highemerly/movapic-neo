import Link from "next/link";
import prisma from "@/lib/db";
import { PublicTimelineClient } from "./PublicTimelineClient";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/SiteHeader";

// 動的レンダリングを強制
export const dynamic = "force-dynamic";

export default async function PublicTimelinePage() {
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
      <SiteHeader />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">パブリックタイムライン</h1>
          <Link href="/">
            <Button variant="outline" size="sm">新しい画像を投稿</Button>
          </Link>
        </div>

        <PublicTimelineClient
          initialImages={images.map((img: (typeof images)[number]) => ({
            id: img.id,
            storageKey: img.storageKey,
            width: img.width,
            height: img.height,
            overlayText: img.overlayText,
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
