import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { UserGalleryClient } from "./UserGalleryClient";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { calculateStreak } from "@/lib/streak";
import { getRankCounts } from "@/lib/achievements/counts";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";
import { userPageRobotsMetadata } from "@/lib/crawlers";
import { buildOgImage, DEFAULT_OG_IMAGE } from "@/lib/ogImage";
import { ToastFlasher } from "@/components/ToastFlasher";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface UserGalleryPageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ deleted?: string }>;
}

export async function generateMetadata({
  params,
}: UserGalleryPageProps): Promise<Metadata> {
  const { username } = await params;
  const robots = await userPageRobotsMetadata(username);

  const { username: cleanUsername, domain } = parseUserHandle(username);
  const user = await prisma.user.findFirst({
    where: { username: cleanUsername, instance: { domain } },
    select: {
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      instance: { select: { domain: true } },
      // OGカードのヒーロー画像に使う最新の公開投稿1件
      images: {
        where: { isPublic: true, isDisabled: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          storageKey: true,
          mimeType: true,
          altText: true,
          overlayText: true,
          width: true,
          height: true,
        },
      },
    },
  });

  // ユーザー不明時は本文側で notFound。ここでは robots のみ返す（既定メタを継承）。
  if (!user) return robots;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");
  const name = user.displayName || user.username;
  const handle = `${user.username}@${user.instance.domain}`;
  const cardTitle = `${name} | SHAMEZO`;
  const description = user.bio?.trim() || `${name}（@${handle}）さんの投稿ギャラリー`;

  // OG画像: 最新の公開投稿画像 > アバター > ブランド既定画像。
  // 投稿画像がAVIFのときは buildOgImage がプロキシでWebP化する。
  const latest = user.images[0];
  const avatarUrl = getAvatarUrl(user.avatarUrl);
  const ogImage = latest
    ? buildOgImage({
        url: `${publicUrl}/${latest.storageKey}`,
        mimeType: latest.mimeType,
        alt: latest.altText || latest.overlayText,
        width: latest.width,
        height: latest.height,
      })
    : avatarUrl
      ? { url: avatarUrl, alt: name }
      : DEFAULT_OG_IMAGE;

  return {
    ...robots,
    // HTMLの <title> はテンプレート（%s | SHAMEZO）でサービス名が付く。
    title: name,
    description,
    openGraph: {
      type: "profile",
      siteName: "SHAMEZO",
      locale: "ja_JP",
      title: cardTitle,
      description,
      url: `${appUrl}/u/${username}`,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: cardTitle,
      description,
      images: [ogImage.url],
    },
  };
}

export default async function UserGalleryPage({
  params,
  searchParams,
}: UserGalleryPageProps) {
  const { username } = await params;
  const { deleted } = await searchParams;
  const currentUser = await getCurrentUser();

  // username@domain を分解（既定インスタンスは domain 省略可）
  const { username: cleanUsername, domain } = parseUserHandle(username);

  // ユーザーを取得（インスタンスドメインで絞り込み）
  const user = await prisma.user.findFirst({
    where: {
      username: cleanUsername,
      instance: {
        domain,
      },
    },
    include: {
      instance: true,
    },
  });

  if (!user) {
    notFound();
  }

  // ピン留め画像を取得（最大4つ、pinnedAtの降順）
  const pinnedImages = await prisma.image.findMany({
    where: {
      userId: user.id,
      isPublic: true, isDisabled: false,
      pinnedAt: { not: null },
    },
    orderBy: { pinnedAt: "desc" },
    select: {
      id: true,
      storageKey: true,
      width: true,
      height: true,
      overlayText: true,
      altText: true,
      position: true,
      size: true,
      blurDataUrl: true,
      favoriteCount: true,
      pinnedAt: true,
      createdAt: true,
    },
  });

  const pinnedImageIds = pinnedImages.map((img) => img.id);

  // 通常の公開画像を取得（ピン留め画像を除く）
  const images = await prisma.image.findMany({
    where: {
      userId: user.id,
      isPublic: true, isDisabled: false,
      id: { notIn: pinnedImageIds },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      storageKey: true,
      width: true,
      height: true,
      overlayText: true,
      altText: true,
      position: true,
      size: true,
      blurDataUrl: true,
      favoriteCount: true,
      pinnedAt: true,
      createdAt: true,
    },
  });

  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");

  // 総画像数と連続投稿日数の算出データを取得
  const [totalImageCount, postDates, rankCounts, perfectAttendance] =
    await Promise.all([
      prisma.image.count({
        where: { userId: user.id, isPublic: true, isDisabled: false },
      }),
      prisma.image.findMany({
        where: { userId: user.id, isPublic: true, isDisabled: false },
        select: { createdAt: true },
      }),
      getRankCounts(user.id),
      hasRecentPerfectAttendance(user.id),
    ]);
  const streak = calculateStreak(postDates.map((p) => p.createdAt));

  return (
    <>
      {(deleted === "1" || deleted === "remote") && (
        <ToastFlasher
          flash={{
            variant: "success",
            message:
              deleted === "remote"
                ? "連携先の投稿も削除しました"
                : "画像を削除しました",
          }}
          clearParams={["deleted"]}
        />
      )}
      <SiteHeader
        user={
          currentUser
            ? {
                username: currentUser.username,
                instanceDomain: currentUser.instance.domain,
                avatarUrl: getAvatarUrl(currentUser.avatarUrl),
              }
            : null
        }
      />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-6xl overflow-x-clip">
        <UserProfileHeader
          user={{
            username: cleanUsername,
            displayName: user.displayName,
            avatarUrl: getAvatarUrl(user.avatarUrl),
            bio: user.bio,
            createdAt: user.createdAt.toISOString(),
            instance: { domain: user.instance.domain, type: user.instance.type },
          }}
          imageCount={totalImageCount}
          goldCount={rankCounts.gold}
          silverCount={rankCounts.silver}
          streak={streak}
          perfectAttendance={perfectAttendance}
          activeTab="photos"
          isOwner={currentUser?.id === user.id}
        />

        {/* 画像一覧（ピン留め画像を先頭に・タブ切替時に横スライドで表示） */}
        <TabTransition tab="photos">
          <UserGalleryClient
            initialImages={[
              ...pinnedImages.map((img) => ({
                ...img,
                pinnedAt: img.pinnedAt?.toISOString() ?? null,
                createdAt: img.createdAt.toISOString(),
              })),
              ...images.map((img) => ({
                ...img,
                pinnedAt: img.pinnedAt?.toISOString() ?? null,
                createdAt: img.createdAt.toISOString(),
              })),
            ]}
            publicUrl={publicUrl}
            username={userPathSegment(cleanUsername, user.instance.domain)}
            pinnedImageIds={pinnedImageIds}
            isOwner={currentUser?.id === user.id}
          />
        </TabTransition>

        <Footer />
      </div>
    </>
  );
}
