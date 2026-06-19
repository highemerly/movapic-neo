import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { FloatingPostButton } from "@/components/FloatingPostButton";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { AchievementsView } from "@/components/achievements/AchievementsView";
import { countRanks } from "@/lib/achievements/catalog";
import { perfectMonthKey } from "@/lib/achievements/perfectMonth";
import { lastMonthYm, thisMonthYm } from "@/lib/achievements/lastMonthPerfect";
import { collectLadderValues } from "@/lib/achievements/stats";
import { calculateStreak } from "@/lib/streak";
import { parseUserHandle } from "@/lib/userHandle";
import { userPageRobotsMetadata } from "@/lib/crawlers";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface AchievementsPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: AchievementsPageProps): Promise<Metadata> {
  const { username } = await params;
  return userPageRobotsMetadata(username);
}

export default async function AchievementsPage({
  params,
}: AchievementsPageProps) {
  const { username } = await params;
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

  if (!user) {
    notFound();
  }

  const [totalImageCount, postDates, achievements, ladderValues] =
    await Promise.all([
      prisma.image.count({ where: { userId: user.id, isPublic: true, isDisabled: false } }),
      prisma.image.findMany({
        where: { userId: user.id, isPublic: true, isDisabled: false },
        select: { createdAt: true },
      }),
      prisma.achievement.findMany({
        where: { userId: user.id },
        select: { key: true, category: true, grantedAt: true },
        orderBy: { grantedAt: "desc" },
      }),
      collectLadderValues(user.id),
    ]);
  const streak = calculateStreak(postDates.map((p) => p.createdAt));

  const granted = achievements.map((a) => ({
    key: a.key,
    category: a.category,
    grantedAt: a.grantedAt.toISOString(),
  }));
  const ranks = countRanks(achievements);

  // 直近（先月/今月）の皆勤賞を取っていればアバターに王冠を表示（取得済みデータから判定）
  const recentPerfectKeys = new Set([
    perfectMonthKey(lastMonthYm()),
    perfectMonthKey(thisMonthYm()),
  ]);
  const perfectAttendance = achievements.some((a) =>
    recentPerfectKeys.has(a.key),
  );

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
          goldCount={ranks.gold}
          silverCount={ranks.silver}
          streak={streak}
          perfectAttendance={perfectAttendance}
          activeTab="achievements"
        />

        {/* 実績一覧（タブ切替時に横スライドで表示） */}
        <TabTransition tab="achievements">
          <AchievementsView granted={granted} ladderValues={ladderValues} />
        </TabTransition>

        <Footer />
      </div>
      <FloatingPostButton maxWidthClass="max-w-4xl" />
    </>
  );
}
