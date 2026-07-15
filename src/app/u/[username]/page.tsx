import { notFound } from "next/navigation";
import Link from "@/components/Link";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { Images, Calendar, Map as MapIcon, Trophy, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { getUserProfileStats } from "@/lib/userStats";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";
import { userPageRobotsMetadata } from "@/lib/crawlers";
import { buildOgImage, DEFAULT_OG_IMAGE } from "@/lib/ogImage";
import { ProfileFeedCard, type ProfileFeedImage } from "@/components/user/ProfileFeedCard";
import type { CachedFavoriter } from "@/lib/fediverse/favorite";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface UserHomePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: UserHomePageProps): Promise<Metadata> {
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

export default async function UserHomePage({ params }: UserHomePageProps) {
  const { username } = await params;
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

  const seg = userPathSegment(cleanUsername, user.instance.domain);
  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");

  // フィードカードに必要な列（実画像＋タイルクロップ用の位置/サイズ・投稿日・カメラ/位置・お気に入り）。
  const feedSelect = {
    id: true,
    storageKey: true,
    overlayText: true,
    altText: true,
    position: true,
    size: true,
    blurDataUrl: true,
    createdAt: true,
    favoriteCount: true,
    favoritersCache: true,
    cameraModel: true,
    locationPrefecture: true,
    locationCity: true,
  } as const;

  // 概要（ホーム）の表示データ。統計はユーザーページ各タブと共通の集計（getUserProfileStats）。
  // ピン留め（最上位）／人気（お気に入り数順）／最近（新着）を取得。人気・最近は後で
  // ピン留め・人気との重複を除いて各2件に絞るため、除外分を見込んで多めに取る。
  const [profileStats, pinnedRaw, popularRaw, recentPool, perfectAttendance] =
    await Promise.all([
      getUserProfileStats(user.id),
      prisma.image.findMany({
        where: { userId: user.id, isPublic: true, isDisabled: false, pinnedAt: { not: null } },
        orderBy: { pinnedAt: "desc" },
        take: 4,
        select: feedSelect,
      }),
      prisma.image.findMany({
        where: { userId: user.id, isPublic: true, isDisabled: false, favoriteCount: { gt: 0 } },
        orderBy: [{ favoriteCount: "desc" }, { createdAt: "desc" }],
        take: 2 + 4,
        select: feedSelect,
      }),
      prisma.image.findMany({
        where: { userId: user.id, isPublic: true, isDisabled: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2 + 4 + 2,
        select: feedSelect,
      }),
      hasRecentPerfectAttendance(user.id),
    ]);

  // JSON列 favoritersCache を型付きに直し、フィードカード用の形へ整える。
  const toFeedImage = (img: {
    id: string;
    storageKey: string;
    overlayText: string;
    altText: string | null;
    position: string;
    size: string;
    blurDataUrl: string | null;
    createdAt: Date;
    favoriteCount: number;
    favoritersCache: unknown;
    cameraModel: string | null;
    locationPrefecture: string | null;
    locationCity: string | null;
  }): ProfileFeedImage => ({
    id: img.id,
    storageKey: img.storageKey,
    overlayText: img.overlayText,
    altText: img.altText,
    position: img.position,
    size: img.size,
    blurDataUrl: img.blurDataUrl,
    createdAt: img.createdAt.toISOString(),
    favoriteCount: img.favoriteCount,
    favoriters: (img.favoritersCache as CachedFavoriter[] | null) ?? [],
    cameraModel: img.cameraModel,
    locationPrefecture: img.locationPrefecture,
    locationCity: img.locationCity,
  });

  const pinnedImages = pinnedRaw.map(toFeedImage);
  const pinnedIds = new Set(pinnedImages.map((img) => img.id));

  // 人気はピン留めと重複しないものを先頭2件（ピン留めが上に出るため）。
  const popularImages = popularRaw
    .filter((img) => !pinnedIds.has(img.id))
    .slice(0, 2)
    .map(toFeedImage);
  const popularIds = new Set(popularImages.map((img) => img.id));

  // 最近はピン留め・人気に出したものを除いて先頭2件（同じ投稿の二重掲載を避ける）。
  const recentImages = recentPool
    .filter((img) => !pinnedIds.has(img.id) && !popularIds.has(img.id))
    .slice(0, 2)
    .map(toFeedImage);

  const registeredAt = user.createdAt.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const isOwner = currentUser?.id === user.id;

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
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-6xl overflow-x-clip">
        <UserProfileHeader
          user={{
            username: cleanUsername,
            displayName: user.displayName,
            avatarUrl: getAvatarUrl(user.avatarUrl),
            instance: { domain: user.instance.domain, type: user.instance.type },
          }}
          perfectAttendance={perfectAttendance}
          activeTab="home"
          isOwner={isOwner}
        />

        {/* 概要（ホーム）本文。プロフィールカード的に読みやすい幅で中央寄せ。 */}
        <TabTransition tab="home">
          <div className="mx-auto max-w-2xl space-y-4">
            {/* 概要: 見出し → 各タブへの4ボタン → 自己紹介・登録日・連続投稿 */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">概要</h2>

              {/* 統計ボタン（各タブへの入口）。ダッシュボードの「あなたの情報」と同じ4指標。 */}
              <div className="grid grid-cols-4 gap-2">
              <Link href={`/u/${seg}/photos`}>
                <Button variant="outline" className="w-full h-14 flex flex-col gap-0.5" aria-label="一覧" title="投稿数">
                  <Images className="h-5 w-5" />
                  <span className="leading-none whitespace-nowrap">
                    <span className="text-sm font-semibold tabular-nums">{profileStats.imageCount}</span>
                    <span className="text-[10px]">枚</span>
                  </span>
                </Button>
              </Link>
              <Link href={`/u/${seg}/calendar`}>
                <Button variant="outline" className="w-full h-14 flex flex-col gap-0.5" aria-label="カレンダー" title="連続投稿日数">
                  <Calendar className="h-5 w-5" />
                  <span className="leading-none whitespace-nowrap">
                    <span className="text-[10px]">連続</span>
                    <span className="text-sm font-semibold tabular-nums">{profileStats.streak}</span>
                    <span className="text-[10px]">日</span>
                  </span>
                </Button>
              </Link>
              {/* 地図が非公開のユーザーは非アクティブ表示（都道府県数も出さない） */}
              {user.showLocationMap ? (
                <Link href={`/u/${seg}/map`}>
                  <Button variant="outline" className="w-full h-14 flex flex-col gap-0.5" aria-label="地図" title="都道府県数">
                    <MapIcon className="h-5 w-5" />
                    <span className="leading-none whitespace-nowrap">
                      <span className="text-sm font-semibold tabular-nums">{profileStats.prefectureCount}</span>
                      <span className="text-[10px]">カ所</span>
                    </span>
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  className="w-full h-14 flex flex-col gap-0.5"
                  aria-label="地図（非公開）"
                  title="地図は非公開です"
                >
                  <MapIcon className="h-5 w-5" />
                  <span className="text-[10px] leading-none">地図</span>
                </Button>
              )}
              <Link href={`/u/${seg}/achievements`}>
                <Button variant="outline" className="w-full h-14 flex flex-col gap-1 justify-center" aria-label="実績" title="獲得実績（金・銀）">
                  <span className="flex items-center gap-1 leading-none whitespace-nowrap">
                    <Trophy className="h-3.5 w-3.5 fill-amber-400 text-amber-600" />
                    <span className="text-sm font-semibold tabular-nums">{profileStats.goldCount}</span>
                  </span>
                  <span className="flex items-center gap-1 leading-none whitespace-nowrap">
                    <Trophy className="h-3.5 w-3.5 fill-slate-300 text-slate-500" />
                    <span className="text-sm font-semibold tabular-nums">{profileStats.silverCount}</span>
                  </span>
                </Button>
              </Link>
              </div>

              {/* 自己紹介・登録日・連続投稿 */}
              <div className="space-y-1 text-xs">
                {user.bio && (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    <span className="text-muted-foreground">自己紹介：</span>
                    {user.bio}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">登録日：</span>
                  {registeredAt}
                </p>
                {profileStats.streak > 0 && (
                  <p>
                    <span className="text-muted-foreground">連続投稿：</span>
                    {profileStats.streak}日
                  </p>
                )}
              </div>
            </section>

            {/* ピン留めした投稿（あれば人気より上に固定表示） */}
            {pinnedImages.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">ピン留めした投稿</h2>
                {pinnedImages.map((img) => (
                  <ProfileFeedCard key={img.id} image={img} seg={seg} publicUrl={publicUrl} />
                ))}
              </section>
            )}

            {/* 人気の投稿（お気に入り数順・最大2件） */}
            {popularImages.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">人気の投稿</h2>
                {popularImages.map((img) => (
                  <ProfileFeedCard key={img.id} image={img} seg={seg} publicUrl={publicUrl} />
                ))}
              </section>
            )}

            {/* 最近の投稿（新しい順・最大2件）。3枚目のカード位置に「すべて見る」を置く。 */}
            {recentImages.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">最近の投稿</h2>
                {recentImages.map((img) => (
                  <ProfileFeedCard key={img.id} image={img} seg={seg} publicUrl={publicUrl} />
                ))}
                <Link
                  href={`/u/${seg}/photos`}
                  className="flex items-center justify-center gap-0.5 rounded-lg border p-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  すべて見る
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </section>
            )}

            {/* 投稿がまだ無いとき */}
            {pinnedImages.length === 0 && popularImages.length === 0 && recentImages.length === 0 && (
              <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                {isOwner
                  ? "まだ投稿がありません。写真を投稿すると、ここに表示されます。"
                  : "まだ投稿がありません。"}
              </div>
            )}
          </div>
        </TabTransition>

        <Footer />
      </div>
    </>
  );
}
