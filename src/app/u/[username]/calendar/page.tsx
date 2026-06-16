import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { CalendarView } from "@/components/calendar/CalendarView";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { FloatingPostButton } from "@/components/FloatingPostButton";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { calculateStreak } from "@/lib/streak";
import { getRankCounts } from "@/lib/achievements/counts";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";

export const dynamic = "force-dynamic";

interface CalendarPageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function CalendarPage({ params, searchParams }: CalendarPageProps) {
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

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // クエリパラメータまたは現在の年月を使用
  const now = new Date();
  const queryYear = query.year ? parseInt(query.year, 10) : null;
  const queryMonth = query.month ? parseInt(query.month, 10) : null;

  // 有効な年月かどうかをチェック
  const isValidYear = queryYear && queryYear >= 2000 && queryYear <= 2100;
  const isValidMonth = queryMonth && queryMonth >= 1 && queryMonth <= 12;

  const initialYear = isValidYear ? queryYear : now.getFullYear();
  const initialMonth = isValidMonth ? queryMonth : now.getMonth() + 1;

  // 総画像数・連続投稿日数・実績ランク数の算出データを取得
  const [totalImageCount, postDates, rankCounts, perfectAttendance] = await Promise.all([
    prisma.image.count({
      where: { userId: user.id, isPublic: true },
    }),
    prisma.image.findMany({
      where: { userId: user.id, isPublic: true },
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
      <SiteHeader user={currentUser ? { username: currentUser.username, instanceDomain: currentUser.instance.domain } : null} />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-4xl">
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
          activeTab="calendar"
        />

        {/* カレンダー */}
        <CalendarView
          username={userPathSegment(cleanUsername, user.instance.domain)}
          publicUrl={publicUrl}
          initialYear={initialYear}
          initialMonth={initialMonth}
          isOwner={isOwner}
        />

        <Footer />
      </div>
      <FloatingPostButton maxWidthClass="max-w-4xl" />
    </>
  );
}
