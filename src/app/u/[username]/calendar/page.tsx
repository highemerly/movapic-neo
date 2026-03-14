import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { CalendarView } from "@/components/calendar/CalendarView";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface CalendarPageProps {
  params: Promise<{ username: string }>;
}

export default async function CalendarPage({ params }: CalendarPageProps) {
  const { username } = await params;
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

  // 現在の年月を初期値として使用
  const now = new Date();
  const initialYear = now.getFullYear();
  const initialMonth = now.getMonth() + 1;

  return (
    <>
      <SiteHeader user={currentUser ? { username: currentUser.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 戻るボタン */}
        <div className="mb-6">
          <Link href={`/u/${cleanUsername}`}>
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              {user.displayName || user.username} さんのページに戻る
            </Button>
          </Link>
        </div>

        {/* ユーザー情報（コンパクト版） */}
        <div className="flex items-center gap-3 mb-6">
          {user.avatarUrl && (
            <Link href={`/u/${cleanUsername}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatarUrl}
                alt={user.displayName || user.username}
                className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity"
              />
            </Link>
          )}
          <div>
            <h1 className="text-lg font-bold">
              {user.displayName || user.username} さんの投稿カレンダー
            </h1>
            <a
              href={`https://${user.instance.domain}/@${user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline"
            >
              @{user.username}@{user.instance.domain}
            </a>
          </div>
        </div>

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
