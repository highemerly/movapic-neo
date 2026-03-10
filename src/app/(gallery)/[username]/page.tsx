import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { ImageGrid } from "@/components/gallery/ImageGrid";

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

  const publicUrl = process.env.R2_PUBLIC_URL || "";

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* ユーザー情報 */}
      <div className="flex items-center gap-4 mb-8">
        {user.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.displayName || user.username}
            className="w-20 h-20 rounded-full"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold">
            {user.displayName || user.username}
          </h1>
          <p className="text-muted-foreground">
            @{user.username}@{user.instance.domain}
          </p>
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
      />

      {/* フッター */}
      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          movapicで画像を作成する
        </Link>
      </div>
    </div>
  );
}
