import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser, getCurrentSessionJti } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { parseUserAgent } from "@/lib/auth/uaParser";
import prisma from "@/lib/db";
import { RevokeSessionButton } from "./RevokeSessionButton";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

export default async function SessionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const currentJti = await getCurrentSessionJti();

  const sessions = await prisma.loginSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <SiteHeader user={{ username: user.username }} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            ダッシュボード
          </Link>
        </div>

        <h1 className="text-lg font-semibold mb-2">ログイン履歴</h1>
        <p className="text-xs text-muted-foreground mb-6">
          直近90日間のログイン履歴を表示しています。これより古い履歴は自動的に削除されます。身に覚えのないログインは「失効させる」でそのセッションを無効化できます。あわせてFediverseの連携アプリ・アクセストークンの無効化もご検討ください。
        </p>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            ログイン履歴はまだ記録されていません（一度ログアウトしてからログインしなおすと記録されます）
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => {
              const { browser, os } = parseUserAgent(session.userAgent);
              const isCurrent = session.jti === currentJti;
              const isRevoked = session.revokedAt !== null;
              return (
                <li
                  key={session.id}
                  className={`bg-muted rounded-lg p-4 text-sm ${
                    isRevoked ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <time
                      dateTime={session.createdAt.toISOString()}
                      className="font-medium tabular-nums"
                    >
                      {dateFormatter.format(session.createdAt)}
                    </time>
                    {isCurrent ? (
                      <span className="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                        現在のセッション
                      </span>
                    ) : isRevoked ? (
                      <span className="text-xs bg-muted-foreground/20 text-muted-foreground rounded-full px-2 py-0.5">
                        失効済み
                      </span>
                    ) : (
                      <RevokeSessionButton sessionId={session.id} />
                    )}
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <dt>環境</dt>
                    <dd className="text-foreground">
                      {browser} / {os}
                    </dd>
                    <dt>IPアドレス</dt>
                    <dd className="font-mono text-foreground break-all">
                      {session.ipAddress}
                    </dd>
                    {session.country && (
                      <>
                        <dt>接続元</dt>
                        <dd className="text-foreground">{session.country}</dd>
                      </>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}

        <Footer />
      </div>
    </>
  );
}
