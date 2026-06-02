import Link from "next/link";
import { ImagePlus } from "lucide-react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { PublicTimelineClient } from "./PublicTimelineClient";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

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

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  return (
    <>
      <SiteHeader user={currentUser ? { username: currentUser.username } : null} />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">みんなの写真</h1>
          <Link href="/create">
            <Button size="sm">
              <ImagePlus className="h-4 w-4" />
              写真を投稿
            </Button>
          </Link>
        </div>

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
              avatarUrl: getAvatarUrl(img.user.avatarUrl),
              instance: img.user.instance.domain,
            },
          }))}
          publicUrl={publicUrl}
        />

        <Footer />
      </div>
    </>
  );
}
