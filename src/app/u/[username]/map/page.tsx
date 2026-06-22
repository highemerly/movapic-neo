import { notFound } from "next/navigation";
import Link from "@/components/Link";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { FloatingPostButton } from "@/components/FloatingPostButton";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { ExpandReveal } from "@/components/ExpandReveal";
import { ScrollIntoViewOnSelect } from "@/components/ScrollIntoViewOnSelect";
import { calculateStreak } from "@/lib/streak";
import { getRankCounts } from "@/lib/achievements/counts";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import {
  PrefectureHeatmap,
  type PrefectureMapData,
} from "@/components/map/PrefectureHeatmap";
import { ImageCard } from "@/components/gallery/ImageCard";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";
import { userPageRobotsMetadata } from "@/lib/crawlers";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface MapPageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ prefecture?: string }>;
}

export async function generateMetadata({
  params,
}: MapPageProps): Promise<Metadata> {
  const { username } = await params;
  return userPageRobotsMetadata(username);
}

export default async function UserMapPage({
  params,
  searchParams,
}: MapPageProps) {
  const { username } = await params;
  const { prefecture: prefectureFilter } = await searchParams;
  const currentUser = await getCurrentUser();

  const { username: cleanUsername, domain } = parseUserHandle(username);

  const user = await prisma.user.findFirst({
    where: {
      username: cleanUsername,
      instance: {
        domain,
      },
    },
    include: { instance: true },
  });

  if (!user) notFound();

  const isOwner = currentUser?.id === user.id;
  const isOptedIn = user.showLocationMap;
  // /u/ パスセグメント（既定インスタンスは素のusername、他は username@domain）
  const seg = userPathSegment(cleanUsername, user.instance.domain);

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

  const profileHeader = (
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
      activeTab="map"
    />
  );

  // オプトインされていない他人 → 公開していません案内
  if (!isOptedIn && !isOwner) {
    return (
      <>
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
        <div className="container mx-auto max-w-6xl px-4 pt-4 pb-8 overflow-x-clip">
          {profileHeader}
          <TabTransition tab="map">
            <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              このユーザーは地図機能を公開していません。
            </div>
          </TabTransition>
          <Footer />
        </div>
        <FloatingPostButton maxWidthClass="max-w-6xl" />
      </>
    );
  }

  // 都道府県付き公開画像を新しい順で取得しJSでグルーピング（サムネイル表示用にも使う）
  const locImages = await prisma.image.findMany({
    where: {
      userId: user.id,
      isPublic: true, isDisabled: false,
      locationPrefecture: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      thumbnailKey: true,
      storageKey: true,
      position: true,
      locationPrefecture: true,
    },
  });

  const data: PrefectureMapData = {};
  let total = 0;
  for (const img of locImages) {
    const pref = img.locationPrefecture;
    if (!pref) continue;
    if (!data[pref]) {
      data[pref] = {
        count: 0,
        latest: {
          id: img.id,
          thumbnailKey: img.thumbnailKey,
          storageKey: img.storageKey,
          position: img.position,
        },
      };
    }
    data[pref].count++;
    total++;
  }

  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");

  // ?prefecture=○○ が指定されていればその都道府県の画像一覧を取得
  const selectedPrefecture =
    prefectureFilter && data[prefectureFilter] ? prefectureFilter : null;
  const prefectureImages = selectedPrefecture
    ? await prisma.image.findMany({
        where: {
          userId: user.id,
          isPublic: true, isDisabled: false,
          locationPrefecture: selectedPrefecture,
        },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true,
          storageKey: true,
          width: true,
          height: true,
          overlayText: true,
          position: true,
          size: true,
          favoriteCount: true,
          createdAt: true,
          locationCity: true,
        },
      })
    : [];

  return (
    <>
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
      <div className="container mx-auto max-w-6xl px-4 pt-4 pb-8 overflow-x-clip">
        {profileHeader}

        {/* 地図タブの本文（タブ切替時に横スライドで表示） */}
        <TabTransition tab="map">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              位置情報付き投稿 {total} 件 ／ {Object.keys(data).length} 都道府県
            </p>
          </div>

          {/* オプトイン未済の本人 → 案内 */}
          {!isOptedIn && isOwner && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              この地図はまだ公開されていません。
              <Link href="/dashboard" className="font-medium underline">
                メニュー
              </Link>
              で「地図を公開する」をONにすると、ユーザーページの「地図」タブを訪問者にも見せられるようになります。現在の表示は本人のみのプレビューです。
            </div>
          )}

          {total === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              位置情報付きの投稿がまだありません。投稿時に「📍を含む」を選ぶと、この地図にプロットされます。
            </div>
          ) : (
            <PrefectureHeatmap
              data={data}
              publicUrl={publicUrl}
              username={seg}
              selectedPrefecture={selectedPrefecture}
            />
          )}

          {/* 都道府県クリックで画像一覧（下部）へスムーズスクロール */}
          <ScrollIntoViewOnSelect
            value={selectedPrefecture}
            targetId="prefecture-images"
          />

          {/* 選択中の都道府県の画像一覧（選択ごとに下へ「うにょー」と展開） */}
          {selectedPrefecture && (
            <ExpandReveal key={selectedPrefecture} className="mt-6">
              <section id="prefecture-images" className="scroll-mt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {selectedPrefecture}の写真
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {prefectureImages.length}件
                      {prefectureImages.length === 60 &&
                        "+（最大60件まで表示）"}
                    </span>
                  </h3>
                  <Link
                    href={`/u/${seg}/map`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    絞り込みを解除
                  </Link>
                </div>
                {prefectureImages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    該当する画像が見つかりませんでした。
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {prefectureImages.map((img) => (
                      <ImageCard
                        key={img.id}
                        image={{
                          id: img.id,
                          storageKey: img.storageKey,
                          width: img.width,
                          height: img.height,
                          overlayText: img.overlayText,
                          position: img.position,
                          size: img.size,
                          favoriteCount: img.favoriteCount,
                          createdAt: img.createdAt.toISOString(),
                        }}
                        publicUrl={publicUrl}
                        username={seg}
                        from="user-map"
                      />
                    ))}
                  </div>
                )}
              </section>
            </ExpandReveal>
          )}
        </TabTransition>

        <Footer />
      </div>
      <FloatingPostButton maxWidthClass="max-w-6xl" />
    </>
  );
}
