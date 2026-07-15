"use client";

import Link from "@/components/Link";
import { Home, Images, Calendar, Map as MapIcon, Trophy, Settings } from "lucide-react";
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
    instance: {
      domain: string;
      type: string;
    };
  };
  /** 直近（先月/今月）の皆勤賞を獲得していればアバターに王冠を表示 */
  perfectAttendance?: boolean;
  activeTab: "home" | "photos" | "calendar" | "map" | "achievements";
  /** 閲覧者が本人のとき、上部右に設定（/settings）への歯車リンクを表示 */
  isOwner?: boolean;
}

/**
 * ユーザーページ共通ヘッダー。
 *
 * 自己紹介・投稿数・実績・連続投稿などのプロフィール情報は「ホーム」タブ（概要ページ）に
 * 集約したため、ここはアバター・名前・ハンドル・タブだけのスリムな見出しに徹する。
 */
export function UserProfileHeader({
  user,
  perfectAttendance = false,
  activeTab,
  isOwner = false,
}: UserProfileHeaderProps) {
  // /u/ パスセグメント（既定インスタンスは素のusername、他は username@domain）
  const seg = userPathSegment(user.username, user.instance.domain);

  // インスタンス種別に応じたアイコン（Misskey/Mastodon）
  const InstanceIcon = user.instance.type === "misskey" ? MisskeyIcon : MastodonIcon;

  // 地図タブは常に表示（オプトイン未済でも表示し、遷移先で公開設定の有無に応じた案内を出す）
  const tabs: TabItem[] = [
    {
      key: "home",
      label: "ホーム",
      icon: Home,
      href: `/u/${seg}`,
    },
    {
      key: "photos",
      label: "一覧",
      icon: Images,
      href: `/u/${seg}/photos`,
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
                className="w-11 h-11 rounded-full hover:opacity-80 transition-opacity"
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
        </div>
        {/* 本人が自分のページを見ているときだけ、上部右に設定への歯車を出す */}
        {isOwner && (
          <Link
            href="/settings"
            aria-label="設定"
            title="設定"
            className="shrink-0 self-start -mr-1 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}
      </div>

      {/* タブナビゲーション（5タブで狭幅だと溢れるため md 未満は非アクティブのラベルを隠す） */}
      <TabBar tabs={tabs} activeKey={activeTab} prefetch responsiveLabels labelBreakpoint="md" />
    </div>
  );
}
