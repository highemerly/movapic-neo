"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/Link";
import { Globe, Server, ImagePlus, User, LayoutDashboard } from "lucide-react";

type BottomNavProps = {
  /** ログインユーザーの /u/ パスセグメント（未ログインは null）。「マイページ」用 */
  selfSegment?: string | null;
  /** ログインユーザーの所属サーバードメイン（未ログインは null）。「同じサーバー」用 */
  instanceDomain?: string | null;
  /** ログインユーザーのアバター画像URL（プロキシ済み）。「マイページ」アイコン用 */
  avatarUrl?: string | null;
};

/**
 * PWA（standalone起動）時のみ画面下部に表示するネイティブ風ナビゲーションバー。
 *
 * 表示制御はCSSのみ（globals.css の `standalone` カスタムバリアント）で行うため、
 * 通常のブラウザタブでは `hidden`、ホーム画面起動時だけ `flex` で出る。
 * JSでの display-mode 判定はしない（ハイドレーション不整合を避ける）。
 *
 * 並び（左→右）: みんな / 同じサーバー / 投稿(中央・強調) / マイページ / メニュー。
 * ログイン必須の「同じサーバー」「マイページ」は未ログイン時は出さない。
 */
export function BottomNav({
  selfSegment,
  instanceDomain,
  avatarUrl,
}: BottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInstancesParam = searchParams.has("instances");

  const isPublicAll = pathname === "/public" && !hasInstancesParam;
  const isPublicInstance = pathname === "/public" && hasInstancesParam;
  const isCreate = pathname === "/create";
  const isMyPage = selfSegment != null && pathname.startsWith(`/u/${selfSegment}`);
  const isDashboard = pathname === "/dashboard";

  return (
    <nav
      aria-label="メインナビゲーション"
      className="standalone:flex fixed inset-x-0 bottom-0 z-40 hidden items-stretch justify-around border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <NavItem
        href="/public"
        label="みんな"
        active={isPublicAll}
        icon={<Globe className="h-5 w-5" />}
      />

      {selfSegment && instanceDomain && (
        <NavItem
          href={`/public?instances=${encodeURIComponent(instanceDomain)}`}
          label="サーバー"
          active={isPublicInstance}
          icon={<Server className="h-5 w-5" />}
        />
      )}

      {/* 中央の投稿ボタン（強調・バー上部から少しはみ出して大きく見せる） */}
      <Link
        href="/create"
        aria-label="写真を投稿"
        className="flex flex-1 flex-col items-center justify-center"
      >
        <span
          className={`-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95 ${
            isCreate ? "ring-primary/30" : ""
          }`}
        >
          <ImagePlus className="h-7 w-7" />
        </span>
        <span className="sr-only">投稿</span>
      </Link>

      {selfSegment && (
        <NavItem
          href={`/u/${selfSegment}`}
          label="あなた"
          active={isMyPage}
          icon={
            avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
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

      <NavItem
        href="/dashboard"
        label="メニュー"
        active={isDashboard}
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
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
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </Link>
  );
}
