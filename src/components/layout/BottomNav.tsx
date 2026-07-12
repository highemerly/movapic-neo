"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/Link";
import { RetryImg } from "@/components/RetryImg";
import { ImagePlus, User, Menu } from "lucide-react";
import { useMenu } from "./AppMenu";
import { getPrimaryNavItems } from "./primaryNav";

type BottomNavProps = {
  /** ログインユーザーの /u/ パスセグメント（未ログインは null）。「マイページ」用 */
  selfSegment?: string | null;
  /** ログインユーザーの所属サーバードメイン（未ログインは null）。「同じサーバー」用 */
  instanceDomain?: string | null;
  /** ログインユーザーのアバター画像URL（プロキシ済み）。「マイページ」アイコン用 */
  avatarUrl?: string | null;
};

/**
 * 画面下部に表示するネイティブ風ナビゲーションバー。
 *
 * 表示制御はCSS（Tailwind）で行う:
 * - モバイル幅（<768px）では常に表示（`flex`）。
 * - PC（md以上）では原則非表示（`md:hidden`）だが、standalone（PWA）起動時だけ表示
 *   （`standalone:md:flex`）。standalone判定は layout.tsx のブロッキングscriptが
 *   <html> に立てる data-standalone 属性ベース（`@media (display-mode: standalone)` 単独だと
 *   iOS アプリ内ブラウザ(WebView)が誤マッチするため）。
 *
 * ただし投稿ページ（/create）で画像アップロード後は「プレビュー/投稿」アクションを優先するため隠す
 * （画像未選択＝アクションが無いうちは表示する）。CreateClient が <html> に立てる
 * data-create-has-image 属性を `create-has-image` バリアントで拾って隠す。
 *
 * 並び（左→右）: みんな / 同じサーバー / 投稿(中央・強調) / あなた / メニュー。
 * ログイン必須の「同じサーバー」「あなた」は未ログイン時は出さない。
 * 「メニュー」はページ遷移ではなく、ヘッダーと共有のスライドメニュー（AppMenu）を開く。
 */
export function BottomNav({
  selfSegment,
  instanceDomain,
  avatarUrl,
}: BottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInstancesParam = searchParams.has("instances");
  const { isOpen, open } = useMenu();

  const isCreate = pathname === "/create";

  // href・現在地判定はヘッダーのインラインナビと共有（primaryNav）。
  // 下部ナビはここから「みんな／同じサーバー／あなた」だけを使い、
  // 中央の投稿ボタンとメニューボタンは独自に描画する。
  const items = getPrimaryNavItems({
    isLoggedIn: selfSegment != null,
    selfSegment,
    instanceDomain,
  });
  const publicItem = items.find((i) => i.key === "public");
  const instanceItem = items.find((i) => i.key === "instance");
  const myPageItem = items.find((i) => i.key === "mypage");

  // 「あなた」タブはユーザーページ配下（カレンダー/実績/地図等）を含むセクション全体を表すため、
  // primaryNav の完全一致（マイページ単独ページ用）ではなく startsWith で広く判定する。
  const isMyPageSection =
    selfSegment != null &&
    (pathname === `/u/${selfSegment}` ||
      pathname.startsWith(`/u/${selfSegment}/`));

  return (
    <nav
      aria-label="メインナビゲーション"
      className={`flex md:hidden standalone:md:flex fixed inset-x-0 bottom-0 z-40 items-stretch justify-around border-t bg-background pb-[env(safe-area-inset-bottom)] ${
        isCreate ? "create-has-image:hidden" : ""
      }`}
    >
      {publicItem && (
        <NavItem
          href={publicItem.href}
          label="みんな"
          active={publicItem.isActive(pathname, hasInstancesParam)}
          icon={<publicItem.Icon className="h-5 w-5" />}
        />
      )}

      {instanceItem && (
        <NavItem
          href={instanceItem.href}
          label="サーバー"
          active={instanceItem.isActive(pathname, hasInstancesParam)}
          icon={<instanceItem.Icon className="h-5 w-5" />}
        />
      )}

      {/* 中央の投稿ボタン（強調・バー上部から少しはみ出して大きく見せる） */}
      <Link
        href="/create"
        aria-label="写真を投稿"
        className="flex flex-1 flex-col items-center justify-center"
      >
        <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95">
          <ImagePlus className="h-6 w-6" />
        </span>
        <span className="sr-only">投稿</span>
      </Link>

      {myPageItem && (
        <NavItem
          href={myPageItem.href}
          label="あなた"
          active={isMyPageSection}
          icon={
            avatarUrl ? (
              <RetryImg
                src={avatarUrl}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5" />
            )
          }
        />
      )}

      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors ${
          isOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Menu className="h-5 w-5" />
        <span className="leading-none">メニュー</span>
      </button>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </Link>
  );
}
