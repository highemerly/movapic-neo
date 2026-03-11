import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SiteHeader } from "@/components/layout/SiteHeader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <>
      <SiteHeader />
      <div className="container mx-auto px-4 py-8 max-w-6xl">

      {/* ユーザー情報 */}
      <div className="bg-muted rounded-lg p-6 mb-4 relative">
        <LogoutButton className="absolute top-4 right-4" />
        <div className="flex items-center gap-4">
          {user.avatarUrl && (
            <Link href={`/u/${user.username}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatarUrl}
                alt={user.displayName || user.username}
                className="w-16 h-16 rounded-full hover:opacity-80 transition-opacity"
              />
            </Link>
          )}
          <div>
            <h2 className="text-xl font-semibold">
              {user.displayName || user.username}
            </h2>
            <a
              href={`https://${user.instance.domain}/@${user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:underline"
            >
              @{user.username}@{user.instance.domain}
            </a>
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link href="/create" className="flex-1">
          <Button className="w-full" size="lg">
            画像を投稿！
          </Button>
        </Link>
        <div className="flex gap-4">
          <Link href="/public" className="flex-1">
            <Button variant="outline" className="w-full" size="lg">
              タイムライン
            </Button>
          </Link>
          <Link href="/settings" className="flex-1">
            <Button variant="outline" className="w-full" size="lg">
              設定を確認
            </Button>
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}
