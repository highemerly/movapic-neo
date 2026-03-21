import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteButton } from "./DeleteButton";
import { ImageNavigation } from "./ImageNavigation";
import { ImageOptionsButton } from "./ImageOptionsButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { FavoriteButton } from "@/components/favorite/FavoriteButton";
import { PinButton } from "@/components/pin/PinButton";
import { Footer } from "@/components/Footer";
import { User, CalendarDays } from "lucide-react";

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
    thumbnailKey: true,
    storageKey: true,
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
      <main className="container mx-auto max-w-2xl px-4 py-2">
        {/* ヘッダー */}
        <div className="mb-2">
          <Link href={isFromPublic ? "/public" : `/u/${username}`}>
            <Button variant="ghost" size="sm">
              ← {isFromPublic ? "公開タイムラインに戻る" : `${image.user.displayName || username} のギャラリーに戻る`}
            </Button>
          </Link>
        </div>

        {/* 画像 */}
        <div className="mb-4">
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
        <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-lg">
          {image.user.avatarUrl && (
            <Link href={`/u/${username}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.user.avatarUrl}
                alt={image.user.displayName || image.user.username}
                className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity"
              />
            </Link>
          )}
          <div className="flex-1 min-w-0">
            <Link
              href={`/u/${username}`}
              className="text-sm font-semibold hover:underline"
            >
              {image.user.displayName || image.user.username}
            </Link>
            <a
              href={`https://${image.user.instance.domain}/@${image.user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-muted-foreground hover:underline truncate"
            >
              @{image.user.username}@{image.user.instance.domain}
            </a>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href={`/u/${username}`}
              className="p-1.5 rounded-full hover:bg-background transition-colors"
              title="ユーザーページ"
            >
              <User className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link
              href={`/u/${username}/calendar`}
              className="p-1.5 rounded-full hover:bg-background transition-colors"
              title="カレンダー"
            >
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
            </Link>
          </div>
        </div>

        {/* テキスト */}
        <div className="mb-4">
          <p className="text-base whitespace-pre-wrap">{image.overlayText}</p>
        </div>

        {/* メタ情報 */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <p>
            {new Date(image.createdAt).toLocaleString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Tokyo",
            })}
            <span className="ml-2">
              {image.source === "email" ? (
                "メール"
              ) : image.source === "mention" ? (
                <a
                  href={`https://${image.user.instance.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {image.user.instance.domain}
                </a>
              ) : (
                <Link href="/create" className="hover:underline">
                  Web
                </Link>
              )}
            </span>
          </p>
          <ImageOptionsButton
            position={image.position}
            color={image.color}
            size={image.size}
            font={image.font}
            arrangement={image.arrangement}
          />
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
            publicUrl={publicUrl}
          />
        </div>

        {/* アクションボタン */}
        <div className="mt-8 flex gap-4 flex-wrap">
          <Link href="/public">
            <Button variant="default">みんなの投稿を見る</Button>
          </Link>
          <Link href="/create">
            <Button variant="outline">写真を投稿する</Button>
          </Link>
          {/* ピン留め・削除ボタン（自分の画像のみ） */}
          {isOwner && (
            <>
              <PinButton imageId={imageId} initialIsPinned={!!image.pinnedAt} />
              <DeleteButton imageId={imageId} username={username} />
            </>
          )}
        </div>

        <Footer />
      </main>
    </div>
  );
}
