import { notFound } from "next/navigation";
import Link from "next/link";
import { getAvatarUrl } from "@/lib/avatar";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteButton } from "./DeleteButton";
import { ImageNavigation } from "./ImageNavigation";
import { ImageOptionsButton } from "./ImageOptionsButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { FavoriteButton } from "@/components/favorite/FavoriteButton";
import {
  classifyPostStatus,
  favoriteErrorMessage,
  type CachedFavoriter,
} from "@/lib/fediverse/favorite";
import { PinButton } from "@/components/pin/PinButton";
import { Footer } from "@/components/Footer";
import { PostSuccessToast } from "./PostSuccessToast";
import { User, CalendarDays, Globe, Heart } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    username: string;
    imageId: string;
  }>;
  searchParams: Promise<{
    from?: string;
    posted?: string;
  }>;
}

export default async function ImageDetailPage({ params, searchParams }: PageProps) {
  const { username, imageId } = await params;
  const { from, posted } = await searchParams;
  const isFromPublic = from === "public";
  const justPosted = posted === "1";

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

  // Mastodonお気に入りキャッシュから初期表示データを算出
  // お気に入り可能 = Mastodonのstatusが存在する投稿のみ（local投稿・Misskeyは対象外）
  const favoritable = image.user.instance.type === "mastodon" && !!image.postId;
  const isMisskey = image.user.instance.type === "misskey";
  const cachedFavoriters =
    (image.favoritersCache as unknown as CachedFavoriter[] | null) ?? [];
  const viewerAcct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  const isFavorited = viewerAcct
    ? cachedFavoriters.some((f) => f.acct === viewerAcct)
    : false;
  // 前回sync結果（postStatus）から現状の理由を復元
  const persistedReason = favoritable ? classifyPostStatus(image.postStatus) : null;
  const initialSyncError = favoriteErrorMessage(persistedReason);
  // 削除確定（404/410）が分かっている時はトグル不可
  const canFavorite =
    !!currentUser &&
    currentUser.instance.type === "mastodon" &&
    persistedReason !== "deleted";

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

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const imageUrl = `${publicUrl}/${image.storageKey}`;

  // 自分の画像かどうか
  const isOwner = currentUser?.id === image.userId;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader user={currentUser ? { username: currentUser.username } : null} />
      {justPosted && <PostSuccessToast />}
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
                src={getAvatarUrl(image.user.avatarUrl) ?? image.user.avatarUrl}
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
            {image.postUrl ? (
              <a
                href={image.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {new Date(image.createdAt).toLocaleString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Tokyo",
                })}
              </a>
            ) : (
              new Date(image.createdAt).toLocaleString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Tokyo",
              })
            )}
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

        {/* EXIF情報（カメラ機種・撮影場所） */}
        {(image.cameraModel || image.locationCity) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {image.cameraModel && (
              <span>
                📷 {image.cameraMake && !image.cameraModel.startsWith(image.cameraMake) ? `${image.cameraMake} ` : ""}{image.cameraModel}
              </span>
            )}
            {image.cameraModel && image.locationCity && <span className="mx-2">·</span>}
            {image.locationCity && (
              <span>
                📍 {image.locationPrefecture ?? ""}{image.locationCity}
              </span>
            )}
          </p>
        )}

        {/* お気に入り（Mastodon連携） */}
        {favoritable ? (
          <div className="mt-2 flex items-center gap-2">
            <FavoriteButton
              imageId={imageId}
              initialCount={image.favoriteCount}
              initialIsFavorited={isFavorited}
              initialFavoriters={cachedFavoriters.map((f) => ({
                acct: f.acct,
                displayName: f.displayName,
                avatarUrl: getAvatarUrl(f.avatarUrl),
                profileUrl: f.profileUrl,
              }))}
              canFavorite={canFavorite}
              initialSyncError={initialSyncError}
              disabledReason={
                persistedReason === "deleted"
                  ? "この投稿は削除されているため操作できません"
                  : !currentUser
                    ? "ログインするとお気に入りできます"
                    : "お気に入りはMastodonアカウントで利用できます"
              }
            />
          </div>
        ) : !isMisskey ? (
          <div className="mt-2 text-[11px] text-muted-foreground/70">
            Mastodon に投稿されていないため、お気に入り機能は使えません。
          </div>
        ) : null}

        {/* ピン留め・削除ボタン（自分の画像のみ） */}
        {isOwner && (
          <div className="mt-2 flex items-center gap-2">
            <PinButton imageId={imageId} initialIsPinned={!!image.pinnedAt} />
            <DeleteButton imageId={imageId} username={username} />
          </div>
        )}

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
        <div className="mt-8 space-y-3">
          <Link href="/create" className="block">
            <Button variant="default" className="w-full">写真を投稿する</Button>
          </Link>
          <div className="bg-muted rounded-lg p-3">
            <div className={`grid gap-3 ${currentUser ? "grid-cols-3" : "grid-cols-1"}`}>
              <Link href="/public">
                <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                  <Globe className="h-4 w-4" />
                  <span className="text-xs">みんなの写真</span>
                </Button>
              </Link>
              {currentUser && (
                <>
                  <Link href={`/u/${currentUser.username}`}>
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                      <User className="h-4 w-4" />
                      <span className="text-xs">プロフィール</span>
                    </Button>
                  </Link>
                  <Link href="/favorite">
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col gap-1.5">
                      <Heart className="h-4 w-4" />
                      <span className="text-xs">お気に入り</span>
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
