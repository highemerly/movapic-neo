import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  // ユーザーの画像を取得
  const images = await prisma.image.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      storageKey: true,
      width: true,
      height: true,
      overlayText: true,
      createdAt: true,
    },
  });

  const publicUrl = process.env.R2_PUBLIC_URL || "";
  const emailDomain = "pic.handon.club";

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <div className="flex gap-4 items-center">
          <Link
            href="/create"
            className="text-sm font-medium text-primary hover:underline"
          >
            画像を作成
          </Link>
          <Link
            href={`/${user.username}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            公開ギャラリー
          </Link>
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:underline"
          >
            設定
          </Link>
        </div>
      </div>

      {/* ユーザー情報 */}
      <div className="bg-muted rounded-lg p-6 mb-8">
        <div className="flex items-center gap-4 mb-4">
          {user.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={user.displayName || user.username}
              className="w-16 h-16 rounded-full"
            />
          )}
          <div>
            <h2 className="text-xl font-semibold">
              {user.displayName || user.username}
            </h2>
            <p className="text-muted-foreground">
              @{user.username}@{user.instance.domain}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">
              ギャラリーURL
            </h3>
            <code className="text-sm bg-background px-2 py-1 rounded">
              {process.env.NEXT_PUBLIC_APP_URL}/@{user.username}
            </code>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">
              メール投稿用アドレス
            </h3>
            <code className="text-sm bg-background px-2 py-1 rounded">
              {user.emailPrefix}@{emailDomain}
            </code>
          </div>
        </div>
      </div>

      {/* 画像一覧 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">あなたの画像</h2>
        <DashboardClient
          initialImages={images.map((img: (typeof images)[number]) => ({
            ...img,
            createdAt: img.createdAt.toISOString(),
          }))}
          publicUrl={publicUrl}
        />
      </div>
    </div>
  );
}
