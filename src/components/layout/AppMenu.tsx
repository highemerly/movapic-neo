"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/Link";
import {
  ImagePlus,
  Globe,
  Server,
  Shuffle,
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
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useUnseenNotifications } from "./useUnseenNotifications";

/**
 * メニューの2つの姿:
 * - スマホ幅（md未満）: ヘッダーのハンバーガー／下部ナビ「メニュー」から開く全高スライドシート
 *   （AppMenuSheet）。開閉状態は MenuContext で共有。
 * - PC幅（md+）: 画面右端に常駐する折りたたみレール（AppRail）。既定はアイコンのみの細い列
 *   （layout.tsx が `md:pr-[60px]` で同じ幅を確保＝コンテンツに重ならない）。レール上端の
 *   ハンバーガーを押すと左へ拡幅してラベル付きメニューになる（アイコンの位置は固定のまま）。
 *
 * 表示データ（ログイン有無・selfSegment 等）は layout の getSessionClaims()／getAvatarUrl()
 * から供給する（DBアクセスなし）。シートとレールはどちらも useMenuSections() で同じ項目定義を
 * 共有するので、項目の追加はそこ1箇所で済む（アカウント／投稿ボタン／ログアウト／ログインのみ
 * 各UIで個別装飾）。
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
      {/* AppMenuSheet（スマホ）も AppRail（PC）も useSearchParams（active判定）を使うため
          Suspense 境界が必要。Provider 本体は suspend させず children を通常描画する。 */}
      <Suspense fallback={null}>
        <AppMenuSheet isOpen={isOpen} setOpen={setOpen} nav={nav} />
        <AppRail nav={nav} />
      </Suspense>
    </MenuContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// 項目定義（シート・レール共有）
// ---------------------------------------------------------------------------

type MenuItem = {
  key: string;
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  /** 外部リンク（新規タブで開く）。お問い合わせ等に使用 */
  external?: boolean;
  /**
   * フルページ遷移させる（next/link を使わず素の <a> で同一タブ遷移）。
   * /random のように「アクセスのたびにサーバー側で結果が変わる」リダイレクト専用ルート向け。
   * <Link> だとホバー時プリフェッチ＋クライアントルーターキャッシュで同じリダイレクト先が
   * 使い回されてしまうため、毎回サーバーを叩かせてランダム性を担保する。
   */
  hardNav?: boolean;
  /**
   * 主要項目。PCの折りたたみレールでは true のものだけ常時表示し、false は展開時のみ表示する
   * （縦に長くなりすぎてスクロールバーが出るのを防ぐ）。スマホのシートは全項目を表示するため
   * このフラグを無視する。
   */
  primary: boolean;
};

type MenuSectionData = {
  key: string;
  title: string;
  items: MenuItem[];
};

/**
 * リンク系のセクション（みんなの写真／あなたの情報／一般）を現在地（active）込みで返す。
 * アカウント欄・「写真を投稿」・ログアウト・ログインは挙動が特殊なので各UI側で個別に描画する。
 * usePathname / useSearchParams を使うので呼び出しは Suspense 境界内であること。
 */
function useMenuSections(nav: MenuNav): MenuSectionData[] {
  const pathname = usePathname();
  const hasInstancesParam = useSearchParams().has("instances");
  const { isLoggedIn, selfSegment, instanceDomain } = nav;
  const userBase = selfSegment ? `/u/${selfSegment}` : null;

  const sections: MenuSectionData[] = [];

  const everyone: MenuItem[] = [
    {
      key: "all",
      href: "/public",
      label: "すべて",
      Icon: Globe,
      active: pathname === "/public" && !hasInstancesParam,
      primary: true,
    },
  ];
  if (instanceDomain) {
    everyone.push({
      key: "instance",
      href: `/public?instances=${encodeURIComponent(instanceDomain)}`,
      label: instanceDomain,
      Icon: Server,
      active: pathname === "/public" && hasInstancesParam,
      primary: true,
    });
  }
  everyone.push({
    key: "random",
    href: "/random",
    label: "ランダム",
    Icon: Shuffle,
    // /random はリダイレクト専用ルート（飛んだ先は status ページ）なので常に非アクティブ
    active: false,
    // 毎回ランダムな結果を得るため素の <a> でフルページ遷移させる（hardNav の説明参照）
    hardNav: true,
    primary: true,
  });
  if (isLoggedIn) {
    everyone.push({
      key: "favorite",
      href: "/favorite",
      label: "お気に入り",
      Icon: Heart,
      active: pathname === "/favorite",
      primary: true,
    });
  }
  sections.push({ key: "everyone", title: "みんなの写真", items: everyone });

  if (isLoggedIn && userBase) {
    sections.push({
      key: "you",
      title: "あなたの情報",
      items: [
        {
          key: "dashboard",
          href: "/dashboard",
          label: "ダッシュボード",
          Icon: LayoutDashboard,
          active: pathname === "/dashboard",
          primary: true,
        },
        {
          key: "notifications",
          href: "/dashboard/notifications",
          label: "通知",
          Icon: Bell,
          active: pathname === "/dashboard/notifications",
          primary: true,
        },
        {
          key: "photos",
          href: userBase,
          label: "写真",
          Icon: Images,
          active: pathname === userBase,
          primary: true,
        },
        {
          key: "calendar",
          href: `${userBase}/calendar`,
          label: "カレンダー",
          Icon: Calendar,
          active: pathname === `${userBase}/calendar`,
          primary: true,
        },
        {
          key: "map",
          href: `${userBase}/map`,
          label: "地図",
          Icon: MapIcon,
          active: pathname.startsWith(`${userBase}/map`),
          primary: false,
        },
        {
          key: "achievements",
          href: `${userBase}/achievements`,
          label: "実績",
          Icon: Trophy,
          active: pathname === `${userBase}/achievements`,
          primary: true,
        },
      ],
    });
  }

  sections.push({
    key: "general",
    title: "一般",
    items: [
      {
        key: "announcements",
        href: "/announcements",
        label: "お知らせ",
        Icon: Megaphone,
        active: pathname.startsWith("/announcements"),
        primary: false,
      },
      {
        key: "terms",
        href: "/terms",
        label: "利用規約",
        Icon: ScrollText,
        active: pathname === "/terms",
        primary: false,
      },
      {
        key: "privacy",
        href: "/privacy",
        label: "プライバシーポリシー",
        Icon: ShieldCheck,
        active: pathname === "/privacy",
        primary: false,
      },
      {
        key: "spec",
        href: "/spec",
        label: "技術仕様",
        Icon: Code,
        active: pathname === "/spec",
        primary: false,
      },
      {
        key: "license",
        href: "/license",
        label: "フォントライセンス",
        Icon: Type,
        active: pathname === "/license",
        primary: false,
      },
      {
        key: "contact",
        href: "https://highemerly.net/contact.html",
        label: "お問い合わせ",
        Icon: Mail,
        active: false,
        external: true,
        primary: false,
      },
    ],
  });

  return sections;
}

// ---------------------------------------------------------------------------
// スマホ幅: 全高スライドシート
// ---------------------------------------------------------------------------

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
  const sections = useMenuSections(nav);
  const close = useCallback(() => setOpen(false), [setOpen]);

  const userBase = selfSegment ? `/u/${selfSegment}` : null;

  // iOS（Safari・PWA standalone 共通）対策。内側スクロール領域が末端（先頭=0／最下端）に
  // ピッタリ達すると、iOS はその後のタッチをラバーバンド用に奪い、Radix Dialog の
  // react-remove-scroll がそれを preventDefault するためスクロールがロックする
  //（＝下まで送ると二度と上に戻れなくなる）。touchstart の瞬間に scrollTop を境界から 1px だけ
  // 内側へずらし、常に「中間」状態にしておくことでロックに入らせない（iNoBounce と同手法）。
  const scrollRef = useRef<HTMLDivElement>(null);
  const nudgeFromEdge = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return; // オーバーフローしていない（スクロール不要）なら何もしない
    if (el.scrollTop <= 0) {
      el.scrollTop = 1;
    } else if (el.scrollTop >= max) {
      el.scrollTop = max - 1;
    }
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        // 幅は控えめに。画面の残り（オーバーレイ）を広く取り、タップで閉じやすくする。
        // 高さは 100dvh（動的ビューポート）で実画面ぴったりに固定する。共有 variant の
        // `inset-y-0 h-full` は iOS（特に Safari）だと fixed 要素がレイアウトビューポート基準に
        // なり下端がツールバー裏に潜って内側スクロール領域の高さ計算が不安定になる。bottom-auto +
        // h-[100dvh] で top 基準の可視高さに収め、末端判定（nudgeFromEdge）を安定させる。
        className="w-[72%] max-w-[17rem] bottom-auto h-[100dvh]"
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
            overscroll-contain: スクロール末端からの連鎖を断つ。
            onTouchStart=nudgeFromEdge: iOS で末端ロック（下まで送ると上に戻れない）を防ぐ。 */}
        <div
          ref={scrollRef}
          onTouchStart={nudgeFromEdge}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {/* 写真を投稿（ボタン風・強調） */}
          <Link
            href="/create"
            onClick={close}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ImagePlus className="h-5 w-5" />
            写真を投稿
          </Link>

          {sections.map((section) => (
            <MenuSection key={section.key} title={section.title}>
              {section.items.map((item) => (
                <MenuLink
                  key={item.key}
                  href={item.href}
                  icon={<item.Icon className="h-5 w-5" />}
                  label={item.label}
                  active={item.active}
                  external={item.external}
                  hardNav={item.hardNav}
                  onNavigate={close}
                />
              ))}
            </MenuSection>
          ))}

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
  hardNav = false,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  /** 外部リンク（新規タブで開く）。お問い合わせ等に使用 */
  external?: boolean;
  /** 素の <a> で同一タブのフルページ遷移にする（/random 用。MenuItem.hardNav 参照） */
  hardNav?: boolean;
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

  // フルページ遷移（同一タブ・プリフェッチ/ルーターキャッシュ非経由）
  if (hardNav) {
    return (
      <a href={href} onClick={onNavigate} className={className}>
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

// ---------------------------------------------------------------------------
// PC幅: 折りたたみレール
// ---------------------------------------------------------------------------

/** 折りたたみ時のレール幅（px）。layout.tsx の `md:pr-[60px]` と必ず一致させること。 */
const RAIL_COLLAPSED = 60;

function AppRail({ nav }: { nav: MenuNav }) {
  const { isLoggedIn, selfSegment, username, avatarUrl } = nav;
  const sections = useMenuSections(nav);
  const pathname = usePathname();
  const userBase = selfSegment ? `/u/${selfSegment}` : null;

  // 通知の未読ドット（PCはヘッダーのベルを廃し、このレールの「通知」だけで既読管理する）。
  const { hasUnseen, markSeen } = useUnseenNotifications();

  const [expanded, setExpanded] = useState(false);
  const collapse = useCallback(() => setExpanded(false), []);

  // 画面遷移したら閉じる（リンクを踏んだ後に開きっぱなしにしない）。
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setExpanded(false);
    }
  }, [pathname]);

  // 展開中は Escape で閉じる。
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      {/* 展開中だけ有効なクリックでも閉じられるオーバーレイ（PC幅のみ）。 */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={collapse}
        className={`hidden md:block fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${
          expanded ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        className={`hidden md:flex fixed right-0 top-0 bottom-0 z-50 flex-col border-l bg-background transition-[width] duration-200 ${
          expanded ? "w-64 shadow-xl" : "w-[60px]"
        }`}
        style={{ width: expanded ? undefined : RAIL_COLLAPSED }}
      >
        {/* 上端: 開閉トグル（ハンバーガー／×）。アイコンは右端固定で、ラベルが左に出る。 */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "メニューを閉じる" : "メニューを開く"}
          className="flex h-12 shrink-0 items-center justify-end gap-3 border-b pl-3 pr-[18px] text-foreground transition-colors hover:bg-accent"
        >
          <RailLabel expanded={expanded}>{expanded ? "閉じる" : "メニュー"}</RailLabel>
          <span className="order-2 flex h-6 w-6 shrink-0 items-center justify-center">
            {expanded ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </span>
        </button>

        {/* 本文（縦スクロール）。画面が極端に低くて溢れる場合でもスクロールバーは出さず、
            スクロール自体は可能にする（no-scrollbar）。 */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain py-2">
          {/* アカウント（ログイン時） */}
          {isLoggedIn && userBase && (
            <RailRow
              href={userBase}
              label={username || "マイページ"}
              expanded={expanded}
              icon={
                avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4" />
                  </span>
                )
              }
            />
          )}

          {/* 写真を投稿（強調） */}
          <RailRow
            href="/create"
            label="写真を投稿"
            highlight
            expanded={expanded}
            icon={<ImagePlus className="h-5 w-5" />}
          />

          {sections.map((section) => {
            // 折りたたみ時は主要項目のみ。展開時は全項目だが主要を先頭に固定して並べる
            // （主要アイコンの縦位置が開閉でズレないように。増えた非主要は下に追加される）。
            const items = expanded
              ? [...section.items].sort(
                  (a, b) => Number(b.primary) - Number(a.primary)
                )
              : section.items.filter((item) => item.primary);
            // 折りたたみ時に主要項目が無いセクション（「一般」など）は丸ごと隠す。
            if (items.length === 0) return null;
            return (
              <div key={section.key} className="mt-1 border-t pt-1 pb-4">
                {/* セクション見出し: テキストは展開時のみ表示（折りたたみ時は透明）。
                    高さ(h-4)は常に確保し、開閉で下の項目が縦にズレないようにする。 */}
                <h2
                  className={`h-4 overflow-hidden pl-3 pr-[18px] text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-opacity duration-150 ${
                    expanded ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {section.title}
                </h2>
                {items.map((item) => {
                  const isNotifications = item.key === "notifications";
                  return (
                    <RailRow
                      key={item.key}
                      href={item.href}
                      label={item.label}
                      active={item.active}
                      external={item.external}
                      hardNav={item.hardNav}
                      expanded={expanded}
                      icon={<item.Icon className="h-5 w-5" />}
                      badge={isNotifications && hasUnseen}
                      onNavigate={isNotifications ? markSeen : undefined}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ログアウト／ログインはスクロール領域の外に出してレール下端へ固定。
            折りたたみ時は主要項目のみで本文が短くなるが、ここは下端固定なので
            開閉どちらでも縦位置が変わらない（折りたたみ時はアイコンのみ）。 */}
        {isLoggedIn ? (
          <div className="shrink-0 border-t pt-1 pb-2">
            <RailLogout expanded={expanded} />
          </div>
        ) : (
          <div className="shrink-0 border-t pt-1 pb-2">
            <RailRow
              href="/"
              label="ログイン"
              expanded={expanded}
              icon={<LogIn className="h-5 w-5" />}
            />
          </div>
        )}
      </div>
    </>
  );
}

/** レール内の行ラベル。折りたたみ時は透明化（アイコン位置は右端固定のまま）。 */
function RailLabel({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`order-1 max-w-[168px] truncate whitespace-nowrap text-sm transition-opacity duration-150 ${
        expanded ? "opacity-100" : "opacity-0"
      }`}
    >
      {children}
    </span>
  );
}

function RailRow({
  href,
  external,
  hardNav = false,
  label,
  icon,
  active = false,
  highlight = false,
  expanded,
  badge = false,
  onNavigate,
}: {
  href: string;
  external?: boolean;
  /** 素の <a> で同一タブのフルページ遷移にする（/random 用。MenuItem.hardNav 参照） */
  hardNav?: boolean;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  /** 「写真を投稿」用の強調。 */
  highlight?: boolean;
  expanded: boolean;
  /** 未読を示す赤ドットをアイコン右上に出す（通知用）。 */
  badge?: boolean;
  /** クリック時のフック（通知の既読化など）。遷移自体は href が担う。 */
  onNavigate?: () => void;
}) {
  const cls = `flex h-11 items-center justify-end gap-3 pl-3 pr-[18px] transition-colors ${
    highlight
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : active
        ? "bg-accent text-primary"
        : "text-foreground hover:bg-accent"
  }`;
  const inner = (
    <>
      <span
        className={`order-1 max-w-[168px] truncate whitespace-nowrap text-sm ${
          highlight ? "font-semibold" : ""
        } transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`}
      >
        {label}
      </span>
      <span className="relative order-2 flex h-6 w-6 shrink-0 items-center justify-center">
        {icon}
        {badge && (
          <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-red-500" />
        )}
      </span>
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        className={cls}
      >
        {inner}
      </a>
    );
  }
  // フルページ遷移（同一タブ・プリフェッチ/ルーターキャッシュ非経由）
  if (hardNav) {
    return (
      <a href={href} title={label} onClick={onNavigate} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cls}
    >
      {inner}
    </Link>
  );
}

function RailLogout({ expanded }: { expanded: boolean }) {
  const confirm = useConfirm();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
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
      title="ログアウト"
      className="flex h-11 w-full items-center justify-end gap-3 pl-3 pr-[18px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
    >
      <RailLabel expanded={expanded}>
        {isLoading ? "処理中..." : "ログアウト"}
      </RailLabel>
      <span className="order-2 flex h-6 w-6 shrink-0 items-center justify-center">
        <LogOut className="h-5 w-5" />
      </span>
    </button>
  );
}
