"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "@/components/Link";
import { X, Info, AlertTriangle } from "lucide-react";
import {
  type AnnouncementRecord,
  formatAnnouncementDate,
  unreadBannerAnnouncements,
} from "@/lib/announcements";
import { dismissAnnouncements } from "@/app/actions/announcements";

const COOKIE_NAME = "ann";

// 掲載中お知らせのセッション内キャッシュ。ページ遷移（SPA）ごとの再取得を避ける。
// 本体は unstable_cache 経由なのでDBは基本引かないが、往復自体もこれで省く。
// フルリロードでモジュールが再評価され最新化される。
let cachedActive: AnnouncementRecord[] | null = null;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  if (!match) return null;
  // cookies().set は値をパーセントエンコードして保存する（例: "2:4" → "2%3A4"）。
  // 復号しないと ":" 区切りの新形式を旧形式（整数）と誤認するため必ずデコードする。
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return match[2];
  }
}


export function AnnouncementBar() {
  const [active, setActive] = useState<AnnouncementRecord[] | null>(
    cachedActive
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 既にセッションキャッシュ済みなら useState 初期値で反映済み。取得は未キャッシュ時のみ。
    if (cachedActive !== null) return;
    let alive = true;
    fetch("/api/v1/announcements/active", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((data) => {
        const list: AnnouncementRecord[] = data?.announcements ?? [];
        cachedActive = list;
        if (alive) setActive(list);
      })
      .catch(() => {
        if (alive) setActive([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const unreadAnnouncements = useMemo(() => {
    if (!active || dismissed) return [];
    return unreadBannerAnnouncements(active, getCookie(COOKIE_NAME));
  }, [active, dismissed]);

  const handleDismissAll = async () => {
    if (!active || active.length === 0) return;
    // 「現在バナー掲載中の id だけ」を既読として保存（置換）。掲載が pinnedUntil で
    // 失効すれば次回以降ここから外れるため、Cookie は同時掲載件数に張り付き肥大化しない。
    await dismissAnnouncements(active.map((a) => a.id));
    setDismissed(true);
  };

  if (unreadAnnouncements.length === 0) return null;

  return (
    <div className="border-b flex items-stretch">
      <div className="flex-1">
        {unreadAnnouncements.map((announcement, index) => (
          <div
            key={announcement.id}
            className={`py-1 text-xs ${
              announcement.type === "warning"
                ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                : "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
            } ${index > 0 ? "border-t border-inherit" : ""}`}
          >
            {/* 帯（背景色）は全幅のまま、文字の左端だけヘッダーのロゴ（SiteHeader の
                container mx-auto px-4 max-w-6xl）と揃える。 */}
            <div className="container mx-auto px-4 max-w-6xl flex items-center gap-1.5">
              {announcement.type === "warning" ? (
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              ) : (
                <Info className="h-3 w-3 flex-shrink-0" />
              )}
              {(() => {
                const href = announcement.detail
                  ? `/announcements/${announcement.id}`
                  : null;
                const content = `(${formatAnnouncementDate(announcement.publishAt)}) ${announcement.message}`;
                return href ? (
                  <Link href={href} className="underline hover:no-underline">
                    {content}
                  </Link>
                ) : (
                  <span>{content}</span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleDismissAll}
        className="flex items-center justify-center self-stretch px-4 hover:opacity-70 flex-shrink-0 text-muted-foreground"
        aria-label="お知らせを閉じる"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
