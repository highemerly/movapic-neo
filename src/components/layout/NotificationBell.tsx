"use client";

import { useCallback } from "react";
import Link from "@/components/Link";
import { RetryImg } from "@/components/RetryImg";
import { Bell, ChevronRight, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { favoriteNotificationText, formatNotificationDate } from "@/lib/notifications/format";
import { useUnseenNotifications } from "./useUnseenNotifications";

export function NotificationBell() {
  const { notifications, hasUnseen, markSeen } = useUnseenNotifications();

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && hasUnseen) {
        markSeen();
      }
    },
    [hasUnseen, markSeen]
  );

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="size-5" />
          {hasUnseen && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
          )}
          <span className="sr-only">通知を開く</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">通知</div>
        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            通知はまだありません
          </p>
        ) : (
          <ul className="py-1">
            {notifications.map((n) => {
              const isReminder = n.type === "makeup-reminder";
              const isFavorite = n.type === "favorite";
              const a = !isReminder && !isFavorite && n.achievementKey ? resolveAchievement(n.achievementKey) : null;
              const href = isReminder
                ? `/u/${n.recipientUsername}/calendar`
                : n.image?.pageUrl ?? "/dashboard/notifications";
              return (
                <li key={n.id}>
                  <Link href={href} className="flex items-start gap-2.5 px-3 py-2 hover:bg-accent">
                    {!isReminder && n.image ? (
                      <RetryImg
                        src={n.image.thumbnailUrl}
                        alt=""
                        className="mt-0.5 h-9 w-9 shrink-0 rounded-md object-cover"
                      />
                    ) : isFavorite ? (
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                        <Heart className="h-4 w-4 fill-current" />
                      </span>
                    ) : (
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <AchievementIcon name={isReminder ? "Crown" : a?.icon ?? "Trophy"} className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">
                        {isFavorite
                          ? favoriteNotificationText(n.favorite)
                          : isReminder
                            ? "皆勤賞まであと少し！1日2枚投稿して、穴埋めしよう。"
                            : `🏆 実績「${a?.title ?? "?"}」を獲得`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatNotificationDate(n.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/dashboard/notifications"
          className="flex items-center justify-center gap-1 border-t px-3 py-2.5 text-sm font-medium text-primary hover:bg-accent"
        >
          もっと見る
          <ChevronRight className="h-4 w-4" />
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
