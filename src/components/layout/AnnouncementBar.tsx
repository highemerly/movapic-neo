"use client";

import { useState, useMemo } from "react";
import Link from "@/components/Link";
import { X, Info, AlertTriangle } from "lucide-react";
import {
  announcements,
  ANNOUNCEMENT_EXPIRY_DAYS,
} from "@/data/announcements";
import { dismissAnnouncements } from "@/app/actions/announcements";
import { useIsHydrated } from "@/hooks/useIsHydrated";

const COOKIE_NAME = "ann";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

function isWithinExpiryDays(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= ANNOUNCEMENT_EXPIRY_DAYS;
}

function formatDate(createdAt: string): string {
  const [, m, d] = createdAt.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function AnnouncementBar() {
  // cookie はクライアント専用のため hydration 後にのみ読む（SSR/初回 render は空）。
  const hydrated = useIsHydrated();
  const [dismissed, setDismissed] = useState(false);

  const unreadAnnouncements = useMemo(() => {
    if (!hydrated || dismissed) return [];
    const lastReadId = parseInt(getCookie(COOKIE_NAME) || "0", 10);
    return announcements
      .filter((a) => a.id > lastReadId && isWithinExpiryDays(a.createdAt))
      .sort((a, b) => b.id - a.id);
  }, [hydrated, dismissed]);

  const handleDismissAll = async () => {
    const validAnnouncements = announcements.filter((a) =>
      isWithinExpiryDays(a.createdAt)
    );
    if (validAnnouncements.length === 0) return;
    const maxId = Math.max(...validAnnouncements.map((a) => a.id));
    await dismissAnnouncements(maxId);
    setDismissed(true);
  };

  if (unreadAnnouncements.length === 0) return null;

  return (
    <div className="border-b flex items-start">
      <div className="flex-1">
        {unreadAnnouncements.map((announcement, index) => (
          <div
            key={announcement.id}
            className={`px-3 py-1 text-xs flex items-center gap-1.5 ${
              announcement.type === "warning"
                ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                : "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
            } ${index > 0 ? "border-t border-inherit" : ""}`}
          >
            {announcement.type === "warning" ? (
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            ) : (
              <Info className="h-3 w-3 flex-shrink-0" />
            )}
            {(() => {
              const href =
                announcement.link ??
                (announcement.detail
                  ? `/announcements/${announcement.id}`
                  : null);
              const content = `(${formatDate(announcement.createdAt)}) ${announcement.message}`;
              return href ? (
                <Link href={href} className="underline hover:no-underline">
                  {content}
                </Link>
              ) : (
                <span>{content}</span>
              );
            })()}
          </div>
        ))}
      </div>
      <button
        onClick={handleDismissAll}
        className="p-1.5 hover:opacity-70 flex-shrink-0 text-muted-foreground"
        aria-label="お知らせを閉じる"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
