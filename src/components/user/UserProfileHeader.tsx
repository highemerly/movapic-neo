"use client";

import Link from "next/link";
import { Images, Calendar, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MastodonIcon } from "@/components/icons/MastodonIcon";

interface Tab {
  key: "photos" | "calendar" | "map";
  label: string;
  icon: typeof Images;
  href: string;
  badge?: string;
}

interface UserProfileHeaderProps {
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
    instance: {
      domain: string;
    };
  };
  imageCount: number;
  activeTab: "photos" | "calendar" | "map";
}

export function UserProfileHeader({
  user,
  imageCount,
  activeTab,
}: UserProfileHeaderProps) {
  // 地図タブは常に表示（オプトイン未済でも表示し、遷移先で公開設定の有無に応じた案内を出す）
  const tabs: Tab[] = [
    {
      key: "photos",
      label: "一覧",
      icon: Images,
      href: `/u/${user.username}`,
    },
    {
      key: "calendar",
      label: "カレンダー",
      icon: Calendar,
      href: `/u/${user.username}/calendar`,
    },
    {
      key: "map",
      label: "地図",
      icon: MapIcon,
      href: `/u/${user.username}/map`,
      badge: "BETA",
    },
  ];

  return (
    <div className="mb-4">
      {/* ユーザー情報 */}
      <div className="flex items-start gap-3 mb-3">
        {user.avatarUrl && (
          <Link href={`/u/${user.username}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt={user.displayName || user.username}
              className="w-12 h-12 rounded-full hover:opacity-80 transition-opacity"
            />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate leading-tight">
            {user.displayName || user.username}
          </h1>
          <a
            href={`https://${user.instance.domain}/@${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <MastodonIcon className="w-3 h-3" />
            @{user.username}@{user.instance.domain}
          </a>
          {user.bio && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{user.bio}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(user.createdAt).toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            に登録 · {imageCount}枚の画像
          </p>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="border-b">
        <nav className="flex gap-0" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && (
                  <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
