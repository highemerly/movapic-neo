import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isMutedByViewer } from "@/lib/mutes";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";
import { TabTransition } from "@/components/user/TabTransition";
import { AchievementsView } from "@/components/achievements/AchievementsView";
import { perfectMonthKey } from "@/lib/achievements/perfectMonth";
import { perfectMonthGrace } from "@/lib/achievements/grace";
import { lastMonthYm, thisMonthYm } from "@/lib/achievements/lastMonthPerfect";
import { collectLadderValues, collectCurrentMonthPerfect } from "@/lib/achievements/stats";
import { parseUserHandle } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
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

  if (!user) {
    notFound();
  }

  const isMuted = await isMutedByViewer(currentUser?.id, user.id);
  const canMute = !!currentUser && currentUser.id !== user.id;
  const isOwner = currentUser?.id === user.id;

  // 「次のステップ」はこのページの主（プロフィールの持ち主）の進捗として全員に表示する。
  const [achievements, ladderValues, currentMonthPerfect] = await Promise.all([
    prisma.achievement.findMany({
      where: { userId: user.id },
      select: { key: true, category: true, grantedAt: true },
      orderBy: { grantedAt: "desc" },
    }),
    collectLadderValues(user.id),
    collectCurrentMonthPerfect(user.id, perfectMonthGrace(user.instance.domain)),
  ]);

  const granted = achievements.map((a) => ({
    key: a.key,
    category: a.category,
    grantedAt: a.grantedAt.toISOString(),
  }));

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
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-6xl overflow-x-clip">
        <UserProfileHeader
          user={{
            username: cleanUsername,
            displayName: user.displayName,
            avatarUrl: getAvatarUrl(user.avatarUrl),
            instance: { domain: user.instance.domain, type: user.instance.type },
          }}
          perfectAttendance={perfectAttendance}
          activeTab="achievements"
          isOwner={isOwner}
          isMuted={isMuted}
          canMute={canMute}
        />

        {/* 実績一覧（タブ切替時に横スライドで表示） */}
        <TabTransition tab="achievements">
          <AchievementsView
            granted={granted}
            ladderValues={ladderValues}
            perfectMonthGrace={perfectMonthGrace(user.instance.domain)}
            currentMonthPerfect={currentMonthPerfect}
          />
        </TabTransition>

        <Footer />
      </div>
    </>
  );
}
