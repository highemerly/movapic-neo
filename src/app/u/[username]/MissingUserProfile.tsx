"use client";

import { usePathname } from "next/navigation";
import { Home, Images, Calendar, Map as MapIcon, Trophy, Globe, ExternalLink } from "lucide-react";
import Link from "@/components/Link";
import { Button } from "@/components/ui/button";
import { TabBar, type TabItem } from "@/components/TabBar";
import { useHomeServer } from "@/components/HomeServerProvider";
import { resolveMissingUser, resolveMissingUserTab } from "./missingUser";

/**
 * 存在しないユーザーページの本文。実在ユーザーのページ（UserProfileHeader＋本文）と同じ体裁で、
 * 中身だけ「いません」に差し替えたもの。
 *
 * not-found.tsx は params を受け取れない（Next.js の仕様）ため、pathname からハンドルを復元する。
 * SHAMEZO 未登録でも Fediverse 側には居ることが多いので、行き止まりにせず当該サーバーへ送る。
 */
export function MissingUserProfile() {
  const pathname = usePathname();
  const homeServer = useHomeServer();
  const missing = resolveMissingUser(pathname, homeServer);
  const activeTab = resolveMissingUserTab(pathname);

  // タブは実在ユーザーのページと同じ5つ。行き先も同じ（当然どれも404）なので、
  // 現在のURLのセグメントをそのまま使う。
  const seg = pathname.split("/")[2] ?? "";
  const tabs: TabItem[] = [
    { key: "home", label: "ホーム", icon: Home, href: `/u/${seg}` },
    { key: "photos", label: "ギャラリー", icon: Images, href: `/u/${seg}/photos` },
    { key: "calendar", label: "カレンダー", icon: Calendar, href: `/u/${seg}/calendar` },
    { key: "map", label: "地図", icon: MapIcon, href: `/u/${seg}/map` },
    { key: "achievements", label: "実績", icon: Trophy, href: `/u/${seg}/achievements` },
  ];

  return (
    <>
      {/* プロフィール見出し（UserProfileHeader と同じ構造。アバターは「?」のプレースホルダ） */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-muted-foreground text-lg">?</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold leading-tight text-muted-foreground truncate">
              {missing ? missing.username : "不明なユーザー"}
            </h1>
            {missing ? (
              <a
                href={missing.profileUrl}
                target="_blank"
                // 任意のドメインが URL から作られるため、外部評価を渡さない nofollow も付ける。
                rel="noopener noreferrer nofollow"
                className="flex w-fit items-center gap-1 mt-[5px] text-[11px] leading-none text-muted-foreground hover:underline"
              >
                <Globe className="w-2.5 h-2.5" />@{missing.handle}
              </a>
            ) : (
              <p className="mt-[5px] text-[11px] leading-none text-muted-foreground">@???@???</p>
            )}
          </div>
        </div>

        <TabBar tabs={tabs} activeKey={activeTab} responsiveLabels labelBreakpoint="md" />
      </div>

      {/* 本文: 投稿ゼロの空状態カードと同じ枠で 404 を伝える */}
      <div className="mx-auto w-full max-w-2xl rounded-lg border bg-muted/30 p-8 text-center space-y-4">
        <p className="text-5xl font-bold text-muted-foreground/40 leading-none">404</p>
        <div className="space-y-1">
          <p className="text-sm">このユーザーは SHAMEZO にいません。</p>
          <p className="text-xs text-muted-foreground">
            まだ SHAMEZO を使っていないか、アカウントが削除された可能性があります。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {missing && (
            <Button asChild variant="default">
              <a
                href={missing.profileUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <ExternalLink className="h-4 w-4" />
                {missing.domain} で見る
              </a>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/public">みんなの投稿を見る</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
