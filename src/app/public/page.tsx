import Link from "next/link";
import prisma from "@/lib/db";
import { PublicTimelineClient } from "./PublicTimelineClient";

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

  const publicUrl = process.env.R2_PUBLIC_URL || "";

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">パブリックタイムライン</h1>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          画像を作成する
        </Link>
      </div>

      <PublicTimelineClient
        initialImages={images.map((img) => ({
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
  );
}
