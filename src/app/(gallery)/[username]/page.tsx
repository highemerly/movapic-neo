import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { ImageGrid } from "@/components/gallery/ImageGrid";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/SiteHeader";

export const dynamic = "force-dynamic";

interface UserGalleryPageProps {
  params: Promise<{ username: string }>;
}

export default async function UserGalleryPage({ params }: UserGalleryPageProps) {
  const { username } = await params;

  // @を除去（URLで /@username の形式でアクセスされた場合）
  const cleanUsername = username.startsWith("@") ? username.slice(1) : username;

  // ユーザーを取得（handon.club限定）
  const user = await prisma.user.findFirst({
    where: {
      username: cleanUsername,
      instance: {
        domain: process.env.MASTODON_INSTANCE || "handon.club",
      },
    },
    include: {
      instance: true,
    },
  });

  if (!user) {
    notFound();
  }

  // ユーザーの公開画像を取得
  const images = await prisma.image.findMany({
    where: {
      userId: user.id,
      isPublic: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      storageKey: true,
      width: true,
      height: true,
      overlayText: true,
      createdAt: true,
    },
  });

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  return (
    <>
      <SiteHeader />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* ユーザー情報 */}
      <div className="flex items-center gap-4 mb-8">
        {user.avatarUrl && (
          <Link href={`/${cleanUsername}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt={user.displayName || user.username}
              className="w-20 h-20 rounded-full hover:opacity-80 transition-opacity"
            />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-bold">
            {user.displayName || user.username}
          </h1>
          <a
            href={`https://${user.instance.domain}/@${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:underline"
          >
            @{user.username}@{user.instance.domain}
          </a>
          <p className="text-sm text-muted-foreground mt-1">
            {images.length}枚の画像
          </p>
        </div>
      </div>

      {/* 画像一覧 */}
      <ImageGrid
        images={images.map((img: typeof images[number]) => ({
          ...img,
          createdAt: img.createdAt.toISOString(),
        }))}
        publicUrl={publicUrl}
        username={cleanUsername}
      />

      {/* フッター */}
      <div className="mt-8 text-center">
        <Link href="/create">
          <Button variant="outline">新しい画像を投稿</Button>
        </Link>
      </div>
    </div>
    </>
  );
}
