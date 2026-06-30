import { redirect } from "next/navigation";
import Link from "@/components/Link";
import { ChevronLeft, Heart } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRecentNotifications } from "@/lib/achievements/notifications";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { favoriteNotificationWho, formatNotificationDate } from "@/lib/notifications/format";
import { userPathSegment } from "@/lib/userHandle";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/?reason=login_required");
  }

  const items = await getRecentNotifications(currentUser.id);
  const selfSeg = userPathSegment(currentUser.username, currentUser.instance.domain);

  return (
    <>
      <SiteHeader
        user={{ username: currentUser.username, instanceDomain: currentUser.instance.domain, avatarUrl: getAvatarUrl(currentUser.avatarUrl) }}
      />
      <div className="container mx-auto px-4 py-3 max-w-xl">
        <div className="mb-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            ダッシュボード
          </Link>
        </div>

        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-base font-bold">通知</h1>
          <span className="text-[11px] text-muted-foreground">最近90日間の通知を新しい順に表示します</span>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            通知はまだありません
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {items.map((n) => {
              const isReminder = n.type === "makeup-reminder";
              const isFavorite = n.type === "favorite";
              const a = !isReminder && !isFavorite && n.achievementKey ? resolveAchievement(n.achievementKey) : null;
              const href = isReminder
                ? `/u/${selfSeg}/calendar`
                : n.image?.pageUrl ?? `/u/${selfSeg}/achievements`;
              return (
                <li key={n.id}>
                  <Link
                    href={href}
                    className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-accent"
                  >
                    {!isReminder && n.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.image.thumbnailUrl}
                        alt=""
                        className="mt-0.5 h-10 w-10 shrink-0 rounded-md object-cover"
                      />
                    ) : isFavorite ? (
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                        <Heart className="h-5 w-5 fill-current" />
                      </span>
                    ) : (
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <AchievementIcon name={isReminder ? "Crown" : a?.icon ?? "Trophy"} className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug line-clamp-2">
                        {isFavorite ? (
                          "❤️ お気に入りに追加されました"
                        ) : isReminder ? (
                          "👑 皆勤賞の穴埋めをしよう"
                        ) : (
                          <>🏆 「<span className="font-semibold">{a?.title ?? "?"}</span>」を獲得</>
                        )}
                      </p>
                      <p className="mt-1 text-xs leading-snug text-muted-foreground line-clamp-2">
                        {isFavorite
                          ? favoriteNotificationWho(n.favorite)
                          : isReminder
                            ? "別日に2枚以上投稿すると、未投稿の日を穴埋めできます"
                            : a?.description ?? ""}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {formatNotificationDate(n.createdAt)}
                      </p>
                    </div>
                  </Link>
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
