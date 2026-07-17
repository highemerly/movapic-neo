"use client";

import Link from "@/components/Link";
import { Home, Images, Calendar, Map as MapIcon, Trophy, Settings, VolumeX } from "lucide-react";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import { AttendanceCrown } from "@/components/user/AttendanceCrown";
import { UserProfileActionsMenu } from "@/components/user/UserProfileActionsMenu";
import { TabBar, type TabItem } from "@/components/TabBar";
import { userPathSegment } from "@/lib/userHandle";
import { useHomeServer } from "@/components/HomeServerProvider";

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
  /** 閲覧者がこのユーザーをミュート中のとき消音バッジを表示（押すとミュート管理へ） */
  isMuted?: boolean;
  /** ログイン済み かつ 本人でないとき、上部右にミュート起点のミートボールメニューを表示 */
  canMute?: boolean;
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
  isMuted = false,
  canMute = false,
}: UserProfileHeaderProps) {
  // /u/ パスセグメント（ホームインスタンスは素のusername、他は username@domain）
  const homeServer = useHomeServer();
  const seg = userPathSegment(user.username, user.instance.domain, homeServer);

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
      label: "ギャラリー",
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
          <h1 className="text-base font-bold leading-tight flex items-center gap-1.5 min-w-0">
            {/* 閲覧者がこのユーザーをミュート中のとき消音バッジ（名前の左）。押すとミュート管理ページへ。 */}
            {isMuted && (
              <Link
                href="/settings/mutes"
                aria-label="ミュート中。ミュートを管理する"
                title="ミュート中（管理する）"
                className="shrink-0 inline-flex items-center justify-center rounded-full bg-muted p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <VolumeX className="h-3.5 w-3.5" />
              </Link>
            )}
            {/* 極端に長い名前でも溢れないよう min-w-0 で truncate を効かせる（バッジは shrink-0 で固定）。 */}
            <span className="truncate min-w-0">{user.displayName || user.username}</span>
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
        {/* 上部右: 本人には設定への歯車、他人（ログイン時）にはミュート起点のミートボール。 */}
        {isOwner ? (
          <Link
            href="/settings"
            aria-label="設定"
            title="設定"
            className="shrink-0 self-start -mr-1 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-5 w-5" />
          </Link>
        ) : (
          canMute && (
            <UserProfileActionsMenu
              handle={seg}
              targetLabel={user.displayName || user.username}
              isMuted={isMuted}
            />
          )
        )}
      </div>

      {/* タブナビゲーション（5タブで狭幅だと溢れるため md 未満は非アクティブのラベルを隠す） */}
      <TabBar tabs={tabs} activeKey={activeTab} prefetch responsiveLabels labelBreakpoint="md" />
    </div>
  );
}
