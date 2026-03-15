import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { CalendarView } from "@/components/calendar/CalendarView";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";

export const dynamic = "force-dynamic";

interface CalendarPageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function CalendarPage({ params, searchParams }: CalendarPageProps) {
  const { username } = await params;
  const query = await searchParams;
  const currentUser = await getCurrentUser();

  // @を除去
  const cleanUsername = username.startsWith("@") ? username.slice(1) : username;

  // ユーザーを取得（handon.club限定）
  const user = await prisma.user.findFirst({
    where: {
      username: cleanUsername,
      instance: {
        domain: process.env.MASTODON_INSTANCE || "handon.club",
      },
    },
    include: {
      instance: true,
    },
  });

  if (!user) {
    notFound();
  }

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // クエリパラメータまたは現在の年月を使用
  const now = new Date();
  const queryYear = query.year ? parseInt(query.year, 10) : null;
  const queryMonth = query.month ? parseInt(query.month, 10) : null;

  // 有効な年月かどうかをチェック
  const isValidYear = queryYear && queryYear >= 2000 && queryYear <= 2100;
  const isValidMonth = queryMonth && queryMonth >= 1 && queryMonth <= 12;

  const initialYear = isValidYear ? queryYear : now.getFullYear();
  const initialMonth = isValidMonth ? queryMonth : now.getMonth() + 1;

  // 総画像数を取得
  const totalImageCount = await prisma.image.count({
    where: {
      userId: user.id,
      isPublic: true,
    },
  });

  return (
    <>
      <SiteHeader user={currentUser ? { username: currentUser.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <UserProfileHeader
          user={{
            username: cleanUsername,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            createdAt: user.createdAt.toISOString(),
            instance: { domain: user.instance.domain },
          }}
          imageCount={totalImageCount}
          activeTab="calendar"
        />

        {/* カレンダー */}
        <CalendarView
          username={cleanUsername}
          publicUrl={publicUrl}
          initialYear={initialYear}
          initialMonth={initialMonth}
        />

        <Footer />
      </div>
    </>
  );
}
