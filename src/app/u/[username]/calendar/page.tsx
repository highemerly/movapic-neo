import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { CalendarView } from "@/components/calendar/CalendarView";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { calculateStreak, toJstDateString } from "@/lib/streak";
import { getRankCounts } from "@/lib/achievements/counts";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";
import { perfectMonthGrace } from "@/lib/achievements/perfectMonth";
import { userPageRobotsMetadata } from "@/lib/crawlers";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface CalendarPageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}

export async function generateMetadata({
  params,
}: CalendarPageProps): Promise<Metadata> {
  const { username } = await params;
  return userPageRobotsMetadata(username);
}

export default async function CalendarPage({
  params,
  searchParams,
}: CalendarPageProps) {
  const { username } = await params;
  const query = await searchParams;
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

  const publicUrl = (
    process.env.S3_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    ""
  ).replace(/\/+$/, "");

  // クエリパラメータまたは現在の年月を使用
  // 初期表示月は必ず JST 基準。サーバーローカルTZ（本番=UTC）だと JST 00:00〜09:00 に
  // 先月が初期表示になり、APIの「今月」判定とも食い違うため toJstDateString に揃える。
  const jstToday = toJstDateString(new Date()); // "YYYY-MM-DD"（JST）
  const queryYear = query.year ? parseInt(query.year, 10) : null;
  const queryMonth = query.month ? parseInt(query.month, 10) : null;

  // 有効な年月かどうかをチェック
  const isValidYear = queryYear && queryYear >= 2000 && queryYear <= 2100;
  const isValidMonth = queryMonth && queryMonth >= 1 && queryMonth <= 12;

  const initialYear = isValidYear ? queryYear : Number(jstToday.slice(0, 4));
  const initialMonth = isValidMonth ? queryMonth : Number(jstToday.slice(5, 7));

  // 総画像数・連続投稿日数・実績ランク数の算出データを取得
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

  // 閲覧者がこのカレンダーの持ち主本人かどうか（穴埋め促しコールアウトは本人のみ表示）
  const isOwner =
    !!currentUser &&
    currentUser.username === cleanUsername &&
    currentUser.instance.domain === user.instance.domain;

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
            bio: user.bio,
            createdAt: user.createdAt.toISOString(),
            instance: { domain: user.instance.domain, type: user.instance.type },
          }}
          imageCount={totalImageCount}
          goldCount={rankCounts.gold}
          silverCount={rankCounts.silver}
          streak={streak}
          perfectAttendance={perfectAttendance}
          activeTab="calendar"
        />

        {/* カレンダー（タブ切替時に横スライドで表示） */}
        <TabTransition tab="calendar">
          <CalendarView
            username={userPathSegment(cleanUsername, user.instance.domain)}
            publicUrl={publicUrl}
            initialYear={initialYear}
            initialMonth={initialMonth}
            isOwner={isOwner}
            grace={perfectMonthGrace(user.instance.domain)}
            serverName={user.instance.domain}
            instanceType={user.instance.type}
          />
        </TabTransition>

        <Footer />
      </div>
    </>
  );
}
