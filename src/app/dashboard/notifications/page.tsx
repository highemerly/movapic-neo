import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getRecentNotifications } from "@/lib/achievements/notifications";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { userPathSegment } from "@/lib/userHandle";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
        user={{ username: currentUser.username, instanceDomain: currentUser.instance.domain }}
      />
      <div className="container mx-auto px-4 pt-4 pb-8 max-w-xl">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            メニュー
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
              const a = !isReminder && n.achievementKey ? resolveAchievement(n.achievementKey) : null;
              const href = isReminder
                ? `/u/${selfSeg}/calendar`
                : n.image?.pageUrl ?? `/u/${selfSeg}/achievements`;
              return (
                <li key={n.id}>
                  <Link
                    href={href}
                    className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    {!isReminder && n.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.image.thumbnailUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <AchievementIcon name={isReminder ? "Crown" : a?.icon ?? "Trophy"} className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm">
                          {isReminder ? (
                            <span className="font-semibold">👑 皆勤賞の穴埋めをしよう</span>
                          ) : (
                            <>🏆 「<span className="font-semibold">{a?.title ?? "?"}</span>」を獲得</>
                          )}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatDate(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground">
                        {isReminder
                          ? "別日に2枚以上投稿すると、未投稿の日を穴埋めできます"
                          : a?.description ?? ""}
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
