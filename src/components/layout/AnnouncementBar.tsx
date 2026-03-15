"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Info, AlertTriangle } from "lucide-react";
import {
  announcements,
  ANNOUNCEMENT_EXPIRY_DAYS,
  type Announcement,
} from "@/data/announcements";
import { dismissAnnouncements } from "@/app/actions/announcements";

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

export function AnnouncementBar() {
  const [unreadAnnouncements, setUnreadAnnouncements] = useState<
    Announcement[]
  >([]);

  useEffect(() => {
    const lastReadId = parseInt(getCookie(COOKIE_NAME) || "0", 10);
    const unread = announcements
      .filter((a) => a.id > lastReadId && isWithinExpiryDays(a.createdAt))
      .sort((a, b) => b.id - a.id);
    setUnreadAnnouncements(unread);
  }, []);

  const handleDismissAll = async () => {
    const validAnnouncements = announcements.filter((a) =>
      isWithinExpiryDays(a.createdAt)
    );
    if (validAnnouncements.length === 0) return;
    const maxId = Math.max(...validAnnouncements.map((a) => a.id));
    await dismissAnnouncements(maxId);
    setUnreadAnnouncements([]);
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
                ? "bg-red-50 text-red-800"
                : "bg-blue-50 text-blue-800"
            } ${index > 0 ? "border-t border-inherit" : ""}`}
          >
            {announcement.type === "warning" ? (
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            ) : (
              <Info className="h-3 w-3 flex-shrink-0" />
            )}
            {announcement.link ? (
              <Link
                href={announcement.link}
                className="underline hover:no-underline"
              >
                {announcement.message}
              </Link>
            ) : (
              <span>{announcement.message}</span>
            )}
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
