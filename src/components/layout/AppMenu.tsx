"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/Link";
import {
  ImagePlus,
  Globe,
  Server,
  Heart,
  LayoutDashboard,
  Bell,
  Images,
  Calendar,
  Map as MapIcon,
  Trophy,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Code,
  Type,
  Mail,
  ExternalLink,
  LogOut,
  LogIn,
  User,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirm } from "@/components/providers/ConfirmProvider";

/**
 * ヘッダーのハンバーガーと下部ナビ「メニュー」の両方から開く共有スライドメニュー。
 *
 * ヘッダー（各ページ内に描画される SiteHeader）と下部ナビ（layout 内の BottomNav）の
 * どちらからでも同じメニューを開けるよう、開閉状態を Context で共有し、Sheet 本体は
 * layout に1つだけ描画する（MenuProvider が内包）。表示データ（ログイン有無・selfSegment 等）は
 * layout の getSessionClaims()／getAvatarUrl() から供給する（DBアクセスなし）。
 */

type MenuNav = {
  isLoggedIn: boolean;
  /** ログインユーザーの /u/ パスセグメント（未ログインは null） */
  selfSegment?: string | null;
  /** ログインユーザー名（アカウント欄のハンドル表示用） */
  username?: string | null;
  /** ログインユーザーの所属サーバードメイン（「{ドメイン}の写真」リンク用） */
  instanceDomain?: string | null;
  /** ログインユーザーのアバター画像URL（プロキシ済み） */
  avatarUrl?: string | null;
};

type MenuContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error("useMenu must be used within <MenuProvider>");
  }
  return ctx;
}

export function MenuProvider({
  children,
  ...nav
}: MenuNav & { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo<MenuContextValue>(
    () => ({
      isOpen,
      open: () => setOpen(true),
      close: () => setOpen(false),
      setOpen,
    }),
    [isOpen]
  );

  return (
    <MenuContext.Provider value={value}>
      {children}
      {/* AppMenuSheet は useSearchParams（active判定）を使うため Suspense 境界が必要。
          Provider 本体は suspend させず children を通常描画する。 */}
      <Suspense fallback={null}>
        <AppMenuSheet isOpen={isOpen} setOpen={setOpen} nav={nav} />
      </Suspense>
    </MenuContext.Provider>
  );
}

function AppMenuSheet({
  isOpen,
  setOpen,
  nav,
}: {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  nav: MenuNav;
}) {
  const { isLoggedIn, selfSegment, username, instanceDomain, avatarUrl } = nav;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInstancesParam = searchParams.has("instances");
  const close = useCallback(() => setOpen(false), [setOpen]);

  const userBase = selfSegment ? `/u/${selfSegment}` : null;

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        // 幅は控えめに。画面の残り（オーバーレイ）を広く取り、タップで閉じやすくする。
        className="w-[72%] max-w-[17rem]"
        // メニューに説明文は不要。明示的に undefined を渡して Radix の
        // 「Missing Description or aria-describedby」警告を抑制する。
        aria-describedby={undefined}
      >
        {/* アカウント欄（ログイン時）／タイトル（未ログイン時） */}
        {isLoggedIn && userBase ? (
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="sr-only">メニュー</SheetTitle>
            <Link
              href={userBase}
              onClick={close}
              className="flex items-center gap-3 rounded-md p-1 -m-1 hover:bg-accent transition-colors"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {username}
                </span>
                {instanceDomain && (
                  <span className="block truncate text-xs text-muted-foreground">
                    @{username}@{instanceDomain}
                  </span>
                )}
              </span>
            </Link>
          </SheetHeader>
        ) : (
          <SheetHeader className="border-b">
            <SheetTitle>メニュー</SheetTitle>
          </SheetHeader>
        )}

        {/* 本文（スクロール可能）。
            min-h-0: flex の子で overflow を効かせ、内容が増えてもフッターが画面外に出ないようにする。
            overscroll-contain: iOS でスクロール末端からの連鎖を断ち、上に戻れなくなる現象を防ぐ。 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* 写真を投稿（ボタン風・強調） */}
          <Link
            href="/create"
            onClick={close}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ImagePlus className="h-5 w-5" />
            写真を投稿
          </Link>

          {/* みんなの写真 */}
          <MenuSection title="みんなの写真">
            <MenuLink
              href="/public"
              icon={<Globe className="h-5 w-5" />}
              label="すべて"
              active={pathname === "/public" && !hasInstancesParam}
              onNavigate={close}
            />
            {instanceDomain && (
              <MenuLink
                href={`/public?instances=${encodeURIComponent(instanceDomain)}`}
                icon={<Server className="h-5 w-5" />}
                label={instanceDomain}
                active={pathname === "/public" && hasInstancesParam}
                onNavigate={close}
              />
            )}
            {isLoggedIn && (
              <MenuLink
                href="/favorite"
                icon={<Heart className="h-5 w-5" />}
                label="お気に入り"
                active={pathname === "/favorite"}
                onNavigate={close}
              />
            )}
          </MenuSection>

          {/* あなたの情報（ログイン時のみ） */}
          {isLoggedIn && userBase && (
            <MenuSection title="あなたの情報">
              <MenuLink
                href="/dashboard"
                icon={<LayoutDashboard className="h-5 w-5" />}
                label="ダッシュボード"
                active={pathname === "/dashboard"}
                onNavigate={close}
              />
              <MenuLink
                href="/dashboard/notifications"
                icon={<Bell className="h-5 w-5" />}
                label="通知"
                active={pathname === "/dashboard/notifications"}
                onNavigate={close}
              />
              <MenuLink
                href={userBase}
                icon={<Images className="h-5 w-5" />}
                label="写真"
                active={pathname === userBase}
                onNavigate={close}
              />
              <MenuLink
                href={`${userBase}/calendar`}
                icon={<Calendar className="h-5 w-5" />}
                label="カレンダー"
                active={pathname === `${userBase}/calendar`}
                onNavigate={close}
              />
              <MenuLink
                href={`${userBase}/map`}
                icon={<MapIcon className="h-5 w-5" />}
                label="地図"
                active={pathname.startsWith(`${userBase}/map`)}
                onNavigate={close}
              />
              <MenuLink
                href={`${userBase}/achievements`}
                icon={<Trophy className="h-5 w-5" />}
                label="実績"
                active={pathname === `${userBase}/achievements`}
                onNavigate={close}
              />
            </MenuSection>
          )}

          {/* 一般（ログイン有無に関わらず表示。旧フッターの各リンク） */}
          <MenuSection title="一般">
            <MenuLink
              href="/announcements"
              icon={<Megaphone className="h-5 w-5" />}
              label="お知らせ"
              active={pathname.startsWith("/announcements")}
              onNavigate={close}
            />
            <MenuLink
              href="/terms"
              icon={<ScrollText className="h-5 w-5" />}
              label="利用規約"
              active={pathname === "/terms"}
              onNavigate={close}
            />
            <MenuLink
              href="/privacy"
              icon={<ShieldCheck className="h-5 w-5" />}
              label="プライバシーポリシー"
              active={pathname === "/privacy"}
              onNavigate={close}
            />
            <MenuLink
              href="/spec"
              icon={<Code className="h-5 w-5" />}
              label="技術仕様"
              active={pathname === "/spec"}
              onNavigate={close}
            />
            <MenuLink
              href="/license"
              icon={<Type className="h-5 w-5" />}
              label="フォントライセンス"
              active={pathname === "/license"}
              onNavigate={close}
            />
            <MenuLink
              href="https://highemerly.net/contact.html"
              icon={<Mail className="h-5 w-5" />}
              label="お問い合わせ"
              external
              onNavigate={close}
            />
          </MenuSection>

          {/* ログアウトは一覧の最下部（一般のさらに下）に区切って配置 */}
          {isLoggedIn && (
            <div className="mt-4 border-t pt-2">
              <LogoutButton />
            </div>
          )}
        </div>

        {/* フッター: 未ログイン時の主導線（ログイン）のみ。
            ログアウトは特別扱いせず一覧の最下部に載せている。 */}
        {!isLoggedIn && (
          <SheetFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Link
              href="/"
              onClick={close}
              className="flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-base font-semibold transition-colors hover:bg-accent"
            >
              <LogIn className="h-5 w-5" />
              ログイン
            </Link>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <nav className="flex flex-col">{children}</nav>
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  active = false,
  external = false,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  /** 外部リンク（新規タブで開く）。お問い合わせ等に使用 */
  external?: boolean;
  onNavigate: () => void;
}) {
  const className = `flex items-center gap-3 rounded-md px-3 py-3 text-base transition-colors ${
    active ? "bg-accent font-semibold text-primary" : "hover:bg-accent text-foreground"
  }`;

  // アイコンは縮ませず、ラベルだけ min-w-0 で truncate（長いサーバー名で横に伸びない）
  const inner = (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
      {external && (
        <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={className}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {inner}
    </Link>
  );
}

function LogoutButton() {
  const confirm = useConfirm();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    // 画面下部にあり誤タップしやすいため、必ず確認モーダルを挟む。
    if (
      !(await confirm({
        title: "ログアウト",
        description: "ログアウトします。よろしいですか？",
        confirmText: "ログアウト",
        destructive: true,
      }))
    ) {
      return;
    }
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoading}
      className="flex items-center gap-3 rounded-md px-3 py-3 text-base text-foreground transition-colors hover:bg-accent disabled:opacity-50"
    >
      <span className="shrink-0">
        <LogOut className="h-5 w-5" />
      </span>
      <span className="min-w-0 truncate">
        {isLoading ? "処理中..." : "ログアウト"}
      </span>
    </button>
  );
}
