"use client";

import Link from "next/link";
import { Images, Calendar, Map as MapIcon, Trophy, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { AttendanceCrown } from "@/components/user/AttendanceCrown";

interface Tab {
  key: "photos" | "calendar" | "map" | "achievements";
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
  goldCount?: number;
  silverCount?: number;
  streak?: number;
  /** 直近（先月/今月）の皆勤賞を獲得していればアバターに王冠を表示 */
  perfectAttendance?: boolean;
  activeTab: "photos" | "calendar" | "map" | "achievements";
}

export function UserProfileHeader({
  user,
  imageCount,
  goldCount = 0,
  silverCount = 0,
  streak = 0,
  perfectAttendance = false,
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
    },
    {
      key: "achievements",
      label: "実績",
      icon: Trophy,
      href: `/u/${user.username}/achievements`,
    },
  ];

  return (
    <div className="mb-4">
      {/* ユーザー情報 */}
      <div className="flex items-start gap-3 mb-2">
        {user.avatarUrl && (
          <div className="relative shrink-0">
            <Link href={`/u/${user.username}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatarUrl}
                alt={user.displayName || user.username}
                className="w-12 h-12 rounded-full hover:opacity-80 transition-opacity"
              />
            </Link>
            {perfectAttendance && <AttendanceCrown />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate leading-tight">
            {user.displayName || user.username}
          </h1>
          <a
            href={`https://${user.instance.domain}/@${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-1 mt-1 text-[11px] leading-none text-muted-foreground hover:underline"
          >
            <MastodonIcon className="w-2.5 h-2.5" />
            @{user.username}@{user.instance.domain}
          </a>
          {user.bio && (
            <p className="text-[11px] leading-tight text-muted-foreground mt-0.5 line-clamp-2">{user.bio}</p>
          )}
          <div className="text-[11px] leading-tight text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1">
            <span>{imageCount}枚の画像</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5">
                <Trophy className="w-3 h-3 fill-amber-400 text-amber-600" />
                <span className="font-semibold text-foreground">{goldCount}</span>
              </span>
              <span className="inline-flex items-center gap-0.5">
                <Trophy className="w-3 h-3 fill-slate-300 text-slate-500" />
                <span className="font-semibold text-foreground">{silverCount}</span>
              </span>
            </span>
            {streak > 0 && (
              <>
                <span>·</span>
                <Flame className="w-3 h-3 -translate-y-px" />
                <span>{streak}日連続投稿中</span>
              </>
            )}
          </div>
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
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden min-[375px]:inline">{tab.label}</span>
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
