import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { UserGalleryClient } from "./UserGalleryClient";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { FloatingPostButton } from "@/components/FloatingPostButton";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { calculateStreak } from "@/lib/streak";
import { getRankCounts } from "@/lib/achievements/counts";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";
import { SuccessToast } from "@/components/SuccessToast";

export const dynamic = "force-dynamic";

interface UserGalleryPageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ deleted?: string }>;
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
      position: true,
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
      position: true,
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
      {deleted === "mastodon" && (
        <SuccessToast message="Mastodonの投稿も削除しました" />
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
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-4xl overflow-x-clip">
        <UserProfileHeader
          user={{
            username: cleanUsername,
            displayName: user.displayName,
            avatarUrl: getAvatarUrl(user.avatarUrl),
            bio: user.bio,
            createdAt: user.createdAt.toISOString(),
            instance: { domain: user.instance.domain },
          }}
          imageCount={totalImageCount}
          goldCount={rankCounts.gold}
          silverCount={rankCounts.silver}
          streak={streak}
          perfectAttendance={perfectAttendance}
          activeTab="photos"
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
          />
        </TabTransition>

        <Footer />
      </div>
      <FloatingPostButton maxWidthClass="max-w-4xl" />
    </>
  );
}
