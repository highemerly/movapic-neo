"use client";

import { useMemo, useState } from "react";
import Link from "@/components/Link";
import { Heart } from "lucide-react";
import type { NotificationFeedItem } from "@/lib/achievements/notifications";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { favoriteNotificationWho, formatNotificationDate } from "@/lib/notifications/format";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";

type Category = "favorite" | "achievement" | "other";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "favorite", label: "お気に入り" },
  { key: "achievement", label: "実績" },
  { key: "other", label: "その他" },
];

function categoryOf(n: NotificationFeedItem): Category {
  if (n.type === "favorite") return "favorite";
  if (n.type === "makeup-reminder") return "other";
  // achievementKey を持つ実績通知。それ以外は「その他」に寄せる。
  return n.achievementKey ? "achievement" : "other";
}

export function NotificationsList({
  items,
  selfSeg,
}: {
  items: NotificationFeedItem[];
  selfSeg: string;
}) {
  // アクセス直後は常に全カテゴリ On。
  const [active, setActive] = useState<Set<Category>>(
    () => new Set<Category>(CATEGORIES.map((c) => c.key))
  );

  const toggle = (key: Category) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(
    () => items.filter((n) => active.has(categoryOf(n))),
    [items, active]
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = active.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              aria-pressed={on}
              className={
                on
                  ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors"
                  : "rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "通知はまだありません" : "該当する通知はありません"}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {filtered.map((n) => {
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
                  className="flex items-start gap-3 px-3 py-2 transition-colors hover:bg-accent"
                >
                  {!isReminder && n.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.image.thumbnailUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  ) : isFavorite ? (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                      <Heart className="h-7 w-7 fill-current" />
                    </span>
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      <AchievementIcon name={isReminder ? "Crown" : a?.icon ?? "Trophy"} className="h-7 w-7" />
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
    </>
  );
}
