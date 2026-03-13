import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteButton } from "./DeleteButton";
import { ImageNavigation } from "./ImageNavigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { FavoriteButton } from "@/components/favorite/FavoriteButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    username: string;
    imageId: string;
  }>;
  searchParams: Promise<{
    from?: string;
  }>;
}

export default async function ImageDetailPage({ params, searchParams }: PageProps) {
  const { username, imageId } = await params;
  const { from } = await searchParams;
  const isFromPublic = from === "public";

  // ログインユーザーを取得
  const currentUser = await getCurrentUser();

  // 画像を取得（ユーザー情報も含む）
  const image = await prisma.image.findUnique({
    where: { id: imageId },
    include: {
      user: {
        include: {
          instance: true,
        },
      },
    },
  });

  // 画像が見つからない、または非公開の場合
  if (!image || !image.isPublic) {
    notFound();
  }

  // ユーザー名が一致しない場合
  if (image.user.username !== username) {
    notFound();
  }

  // お気に入り状態を取得
  const [isFavorited, recentFavoriters] = await Promise.all([
    currentUser
      ? prisma.favorite
          .findUnique({
            where: {
              userId_imageId: {
                userId: currentUser.id,
                imageId: image.id,
              },
            },
          })
          .then((f) => !!f)
      : Promise.resolve(false),
    prisma.favorite.findMany({
      where: { imageId: image.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        user: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
    }),
  ]);

  // 前後の画像を取得
  // 公開TLからの場合: 全ユーザーの公開画像を対象
  // ユーザーギャラリーからの場合: 同じユーザーの公開画像のみ
  const navigationSelect = {
    id: true,
    overlayText: true,
    user: {
      select: {
        username: true,
      },
    },
  };

  const [prevImage, nextImage] = await Promise.all([
    // 前の画像（古い方向）
    prisma.image.findFirst({
      where: {
        ...(isFromPublic ? {} : { userId: image.userId }),
        isPublic: true,
        createdAt: { lt: image.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: navigationSelect,
    }),
    // 次の画像（新しい方向）
    prisma.image.findFirst({
      where: {
        ...(isFromPublic ? {} : { userId: image.userId }),
        isPublic: true,
        createdAt: { gt: image.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: navigationSelect,
    }),
  ]);

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const imageUrl = `${publicUrl}/${image.storageKey}`;

  // 自分の画像かどうか
  const isOwner = currentUser?.id === image.userId;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader user={currentUser ? { username: currentUser.username } : null} />
      <main className="container mx-auto max-w-2xl px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <Link href={isFromPublic ? "/public" : `/u/${username}`}>
            <Button variant="ghost" size="sm">
              ← {isFromPublic ? "公開タイムラインに戻る" : `${image.user.displayName || username} のギャラリーに戻る`}
            </Button>
          </Link>
        </div>

        {/* 画像 */}
        <div className="mb-6">
          <div className="rounded-lg overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={image.overlayText}
              className="w-full object-contain"
            />
          </div>
        </div>

        {/* 投稿者情報 */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-muted rounded-lg">
          {image.user.avatarUrl && (
            <Link href={`/u/${username}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.user.avatarUrl}
                alt={image.user.displayName || image.user.username}
                className="w-12 h-12 rounded-full hover:opacity-80 transition-opacity"
              />
            </Link>
          )}
          <div>
            <Link
              href={`/u/${username}`}
              className="font-semibold hover:underline"
            >
              {image.user.displayName || image.user.username}
            </Link>
            <a
              href={`https://${image.user.instance.domain}/@${image.user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted-foreground hover:underline"
            >
              @{image.user.username}@{image.user.instance.domain}
            </a>
          </div>
        </div>

        {/* テキスト */}
        <div className="mb-6">
          <p className="text-lg whitespace-pre-wrap">{image.overlayText}</p>
        </div>

        {/* メタ情報 */}
        <div className="text-sm text-muted-foreground">
          <p>
            {new Date(image.createdAt).toLocaleString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Tokyo",
            })}
          </p>
        </div>

        {/* お気に入りボタン */}
        <div className="mt-4">
          <FavoriteButton
            imageId={imageId}
            initialCount={image.favoriteCount}
            initialIsFavorited={isFavorited}
            recentFavoriters={recentFavoriters.map((f) => ({
              username: f.user.username,
              displayName: f.user.displayName,
            }))}
            isLoggedIn={!!currentUser}
          />
        </div>

        {/* 前後の画像ナビゲーション */}
        <div className="mt-8">
          <ImageNavigation
            prevImage={prevImage}
            nextImage={nextImage}
            from={isFromPublic ? "public" : undefined}
          />
        </div>

        {/* 削除ボタン（自分の画像のみ） */}
        {isOwner && (
          <div className="mt-8">
            <DeleteButton imageId={imageId} username={username} />
          </div>
        )}
      </main>
    </div>
  );
}
