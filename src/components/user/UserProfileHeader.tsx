"use client";

import Link from "@/components/Link";
import { Images, Calendar, Map as MapIcon, Trophy, Flame } from "lucide-react";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import { AttendanceCrown } from "@/components/user/AttendanceCrown";
import { TabBar, type TabItem } from "@/components/TabBar";
import { userPathSegment } from "@/lib/userHandle";

interface UserProfileHeaderProps {
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    createdAt: string;
    instance: {
      domain: string;
      type: string;
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
  // /u/ パスセグメント（既定インスタンスは素のusername、他は username@domain）
  const seg = userPathSegment(user.username, user.instance.domain);

  // インスタンス種別に応じたアイコン（Misskey/Mastodon）
  const InstanceIcon = user.instance.type === "misskey" ? MisskeyIcon : MastodonIcon;

  // 地図タブは常に表示（オプトイン未済でも表示し、遷移先で公開設定の有無に応じた案内を出す）
  const tabs: TabItem[] = [
    {
      key: "photos",
      label: "一覧",
      icon: Images,
      href: `/u/${seg}`,
    },
    {
      key: "calendar",
      label: "カレンダー",
      icon: Calendar,
      href: `/u/${seg}/calendar`,
    },
    {
      key: "map",
      label: "地図",
      icon: MapIcon,
      href: `/u/${seg}/map`,
    },
    {
      key: "achievements",
      label: "実績",
      icon: Trophy,
      href: `/u/${seg}/achievements`,
    },
  ];

  return (
    <div className="mb-4">
      {/* ユーザー情報 */}
      <div className="flex items-center gap-3 mb-2">
        {user.avatarUrl && (
          <div className="relative shrink-0">
            <Link href={`/u/${seg}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.avatarUrl}
                alt={user.displayName || user.username}
                className="w-[52px] h-[52px] rounded-full hover:opacity-80 transition-opacity"
                loading="lazy"
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
            className="flex w-fit items-center gap-1 mt-[5px] text-[11px] leading-none text-muted-foreground hover:underline"
          >
            <InstanceIcon className="w-2.5 h-2.5" />
            @{user.username}@{user.instance.domain}
          </a>
          {user.bio && (
            <p className="text-[11px] leading-tight text-muted-foreground mt-[3px] line-clamp-2">{user.bio}</p>
          )}
          <div className="text-[11px] leading-tight text-muted-foreground mt-[3px] flex flex-wrap items-center gap-x-1">
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
      <TabBar tabs={tabs} activeKey={activeTab} prefetch responsiveLabels />
    </div>
  );
}
