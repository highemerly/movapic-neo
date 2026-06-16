import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { getAvatarUrl } from "@/lib/avatar";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteButton } from "./DeleteButton";
import { DeleteLocationButton } from "./DeleteLocationButton";
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
import { parseUserHandle } from "@/lib/userHandle";
import { NewUserGuide } from "@/components/onboarding/NewUserGuide";
import { getAllowedServers } from "@/lib/auth/allowedServers";
import { FloatingPostButton } from "@/components/FloatingPostButton";
import { PostSuccessToast } from "./PostSuccessToast";
import { AchievementCelebration } from "./AchievementCelebration";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { AttendanceCrown } from "@/components/user/AttendanceCrown";
import { User, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username, imageId } = await params;

  const image = await prisma.image.findUnique({
    where: { id: imageId },
    select: {
      storageKey: true,
      overlayText: true,
      mimeType: true,
      width: true,
      height: true,
      isPublic: true,
      user: { select: { username: true, displayName: true, instance: { select: { domain: true } } } },
    },
  });

  // 非公開・不存在・ハンドル（username@domain）不一致はデフォルト（noindex扱い）
  const { username: cleanUsername, domain } = parseUserHandle(username);
  if (
    !image ||
    !image.isPublic ||
    image.user.username !== cleanUsername ||
    image.user.instance.domain !== domain
  ) {
    return { title: "画像が見つかりません", robots: { index: false } };
  }

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const imageUrl = `${publicUrl}/${image.storageKey}`;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const pageUrl = `${appUrl}/u/${username}/status/${imageId}`;

  const title = image.overlayText;
  const authorName = image.user.displayName || image.user.username;
  const description = `${authorName} さんの投稿`;

  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: "SHAMEZO",
      locale: "ja_JP",
      title,
      description,
      url: pageUrl,
      images: [
        {
          url: imageUrl,
          width: image.width,
          height: image.height,
          alt: image.overlayText,
          type: image.mimeType,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

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

  // ハンドル（username@domain）が一致しない場合
  const { username: cleanUsername, domain } = parseUserHandle(username);
  if (image.user.username !== cleanUsername || image.user.instance.domain !== domain) {
    notFound();
  }

  // 投稿者が直近（先月/今月）の皆勤賞を取っていればアバターに王冠を表示
  const posterPerfectAttendance = await hasRecentPerfectAttendance(image.user.id);

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
        instance: { select: { domain: true } },
      },
    },
  };

  const [prevImage, nextImage, earnedAchievementRows] = await Promise.all([
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
    // この投稿がきっかけで獲得した実績（実績タブと同様、誰でも閲覧可）
    prisma.achievement.findMany({
      where: { imageId: image.id },
      orderBy: { grantedAt: "asc" },
      select: { key: true, category: true },
    }),
  ]);

  const earnedAchievements = earnedAchievementRows.map((a) =>
    resolveAchievement(a.key, a.category)
  );

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const imageUrl = `${publicUrl}/${image.storageKey}`;

  // 自分の画像かどうか
  const isOwner = currentUser?.id === image.userId;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader user={currentUser ? { username: currentUser.username, instanceDomain: currentUser.instance.domain } : null} />
      {justPosted && <PostSuccessToast />}
      {justPosted && <AchievementCelebration username={username} />}
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

        {/* テキスト */}
        <div className="mb-4">
          <p className="text-base whitespace-pre-wrap break-words">{image.overlayText}</p>
        </div>

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

        {/* EXIF情報（カメラ機種・撮影場所）。投稿者本人のみ撮影場所だけ削除可能。 */}
        {(image.cameraModel || image.locationPrefecture) && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {image.cameraModel && (
              <span>
                📷 {image.cameraModel}{image.cameraMake && !image.cameraModel.startsWith(image.cameraMake) ? `（${image.cameraMake}）` : ""}
              </span>
            )}
            {image.cameraModel && image.locationPrefecture && <span aria-hidden>·</span>}
            {image.locationPrefecture && (
              <span className="inline-flex items-center gap-1">
                <span>
                  📍{" "}
                  <Link
                    href={`/u/${username}/map?prefecture=${encodeURIComponent(image.locationPrefecture)}`}
                    className="hover:underline"
                  >
                    {image.locationPrefecture}
                  </Link>
                  {image.locationCity ?? ""}
                </span>
                {isOwner && (
                  <DeleteLocationButton
                    imageId={imageId}
                    locationLabel={`${image.locationPrefecture}${image.locationCity ?? ""}`}
                  />
                )}
              </span>
            )}
          </p>
        )}

        {/* メタ情報（日時・ソース・設定） */}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
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

        {/* 投稿者情報（王冠が頭上に出るぶん、王冠ありのときだけ上パディングを確保） */}
        <div
          className={`flex items-center gap-2 mt-4 px-3 pb-3 bg-muted rounded-lg ${
            posterPerfectAttendance ? "pt-5" : "pt-3"
          }`}
        >
          {image.user.avatarUrl && (
            <div className="relative shrink-0">
              <Link href={`/u/${username}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getAvatarUrl(image.user.avatarUrl) ?? image.user.avatarUrl}
                  alt={image.user.displayName || image.user.username}
                  className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity"
                />
              </Link>
              {posterPerfectAttendance && <AttendanceCrown />}
            </div>
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

        {/* この投稿で獲得した実績（各チップはその実績の詳細モーダルを開く） */}
        {earnedAchievements.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
            <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              🏆 この投稿で実績を獲得しました
            </p>
            <div className="flex flex-wrap gap-1.5">
              {earnedAchievements.map((a) => (
                <Link
                  key={a.key}
                  href={`/u/${username}/achievements?a=${encodeURIComponent(a.key)}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-200/70 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-300/80 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-800/60"
                >
                  <AchievementIcon name={a.icon} className="h-3.5 w-3.5" />
                  {a.title}
                </Link>
              ))}
            </div>
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

        {/* 新規ユーザー向けガイド（SNSからの初回流入の受け皿） */}
        <NewUserGuide
          isLoggedIn={!!currentUser}
          allowedServers={getAllowedServers()}
        />

        <Footer />
      </main>
      {/* 非ログインユーザーには投稿FABを出さない（ガイドのログイン導線へ誘導） */}
      {currentUser && <FloatingPostButton />}
    </div>
  );
}
