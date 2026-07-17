import { notFound } from "next/navigation";
import Link from "@/components/Link";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isMutedByViewer } from "@/lib/mutes";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { ExpandReveal } from "@/components/ExpandReveal";
import { ScrollIntoViewOnSelect } from "@/components/ScrollIntoViewOnSelect";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import {
  PrefectureHeatmap,
  type PrefectureMapData,
} from "@/components/map/PrefectureHeatmap";
import { PrefectureImageGrid } from "@/components/map/PrefectureImageGrid";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
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

  const parsed = parseUserHandle(username, getHomeServer());
  if (!parsed) notFound();
  const { username: cleanUsername, domain } = parsed;

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
  const isMuted = await isMutedByViewer(currentUser?.id, user.id);
  const canMute = !!currentUser && !isOwner;
  const isOptedIn = user.showLocationMap;
  // /u/ パスセグメント（既定インスタンスは素のusername、他は username@domain）
  const seg = userPathSegment(cleanUsername, user.instance.domain, getHomeServer());

  // ヘッダーのアバター王冠用（皆勤賞判定）
  const perfectAttendance = await hasRecentPerfectAttendance(user.id);

  const profileHeader = (
    <UserProfileHeader
      user={{
        username: cleanUsername,
        displayName: user.displayName,
        avatarUrl: getAvatarUrl(user.avatarUrl),
        instance: { domain: user.instance.domain, type: user.instance.type },
      }}
      perfectAttendance={perfectAttendance}
      activeTab="map"
      isOwner={isOwner}
      isMuted={isMuted}
      canMute={canMute}
    />
  );

  // 未公開なら本人でも地図は見せない。本人には公開への導線、他人には非公開案内を出す
  if (!isOptedIn) {
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
            {isOwner ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                地図はまだ公開されていません。
                <Link href="/settings#privacy" className="font-medium underline">
                  設定
                </Link>
                で「地図を公開する」をONにすると、このページで地図形式で写真を閲覧できます（あなたも訪問者も見ることができます）。
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                このユーザーは地図を公開していません。
              </div>
            )}
          </TabTransition>
          <Footer />
        </div>
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

  const publicUrl = (process.env.S3_PUBLIC_URL || "").replace(/\/+$/, "");

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
          altText: true,
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

          {/* 件数（地図・表示切替の更に下） */}
          {total > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              位置情報付き投稿 {total} 件 ／ {Object.keys(data).length} 都道府県
            </p>
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
                <PrefectureImageGrid
                  images={prefectureImages.map((img) => ({
                    id: img.id,
                    storageKey: img.storageKey,
                    width: img.width,
                    height: img.height,
                    overlayText: img.overlayText,
                    altText: img.altText,
                    position: img.position,
                    size: img.size,
                    favoriteCount: img.favoriteCount,
                    createdAt: img.createdAt.toISOString(),
                  }))}
                  publicUrl={publicUrl}
                  username={seg}
                  selectedPrefecture={selectedPrefecture}
                />
              </section>
            </ExpandReveal>
          )}
        </TabTransition>

        <Footer />
      </div>
    </>
  );
}
