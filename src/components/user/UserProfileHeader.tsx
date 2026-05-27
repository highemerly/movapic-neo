"use client";

import Link from "next/link";
import { Images, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { MastodonIcon } from "@/components/icons/MastodonIcon";

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
  activeTab: "photos" | "calendar";
}

export function UserProfileHeader({
  user,
  imageCount,
  activeTab,
}: UserProfileHeaderProps) {
  const tabs = [
    {
      key: "photos" as const,
      label: "全ての写真",
      icon: Images,
      href: `/u/${user.username}`,
    },
    {
      key: "calendar" as const,
      label: "カレンダー",
      icon: Calendar,
      href: `/u/${user.username}/calendar`,
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
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
