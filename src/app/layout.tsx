import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/layout/BottomNav";
import { MenuProvider } from "@/components/layout/AppMenu";
import { NotificationsProvider } from "@/components/layout/useUnseenNotifications";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PullToRefreshProvider } from "@/components/PullToRefresh";
import { getSessionClaims } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import { HomeServerProvider } from "@/components/HomeServerProvider";
import { getAvatarUrl } from "@/lib/avatar";
import { DEFAULT_OG_IMAGE } from "@/lib/ogImage";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const SITE_NAME = "SHAMEZO";
const SITE_DESCRIPTION = "写真 × ひとこと = SNSに投稿しよう。";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "ja_JP",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE.url],
  },
  // PWA: ホーム画面に追加 / インストール可能化
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// 真のPWA起動（standalone）かどうかを初回ペイント前に判定し <html> に data-standalone を立てる。
// CSSの `@media (display-mode: standalone)` だけだと iOS のアプリ内ブラウザ（WebView）が
// 全画面ゆえ standalone を誤マッチして下部ナビ等が出てしまう。iOS では WebView で立たない
// `navigator.standalone === true`（ホーム画面PWAのみ true）で判定し、誤検知を防ぐ。
// 非iOSは display-mode で判定（Androidのアプリ内WebViewは browser を返すため誤検知しにくい）。
// <body> 先頭のネイティブ <script> は HTML パース時（＝下部コンテンツのペイント前）に同期実行
// されるので、DOMをペイント前に書き換えて不整合・フラッシュを防げる。インラインコードは children
// ではなく dangerouslySetInnerHTML で渡す（children 直書きの <script> は React 19 が
// 「クライアント描画時に実行されない」と警告するため。next/script の beforeInteractive も同経路で
// 警告が出たのでネイティブ <script> に変更）。
const STANDALONE_DETECT_SCRIPT = `(function(){try{var n=navigator,ua=n.userAgent||"",isIos=/iphone|ipad|ipod/i.test(ua)||(n.platform==="MacIntel"&&n.maxTouchPoints>1),s=isIos?n.standalone===true:(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches);if(s)document.documentElement.setAttribute("data-standalone","");}catch(e){}})();`;

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // iOSのノッチ等でも safe-area を使えるように画面いっぱいに広げる
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // PWA下部ナビ用のログイン情報（DBアクセスなし・表示専用）。
  const claims = await getSessionClaims();
  // ホームインスタンス（HOME_SERVER）。クライアント側のリンク生成でも使うため Context で配る。
  const homeServer = getHomeServer();
  const selfSegment =
    claims?.username && claims.instanceDomain
      ? userPathSegment(claims.username, claims.instanceDomain, homeServer)
      : null;
  // 管理者（ADMIN_ACCTS）判定。メニューに /admin/stats 導線を出すためだけの表示用。
  // 実際のアクセス制御は admin/layout.tsx のガードが担う（ここは env 照合のみでDBアクセスなし）。
  const isAdminUser = isAdmin(
    claims ? `${claims.username}@${claims.instanceDomain}` : null
  );

  return (
    <html
      lang="ja"
      suppressHydrationWarning
      // 下部ナビ（BottomNav）とその余白をログイン時だけ有効化するためのフラグ。
      // CSS（globals.css）が [data-logged-in] body で余白を出し分ける。
      data-logged-in={claims != null ? "" : undefined}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* standalone判定（<body>先頭のネイティブ script でペイント前に同期実行）。上部コメント参照。 */}
        <script
          id="standalone-detect"
          dangerouslySetInnerHTML={{ __html: STANDALONE_DETECT_SCRIPT }}
        />
        <HomeServerProvider value={homeServer}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* ヘッダーのハンバーガーと下部ナビ「メニュー」の両方から開く共有スライドメニュー。
              開閉状態は Context で共有し、Sheet 本体は MenuProvider 内に1つだけ描画する。
              MenuProvider 自体は suspend しない（children は通常通り描画）。search params に
              依存する Sheet 本体／BottomNav はそれぞれ内部で Suspense 境界を持つ。
              ログアウトの確認モーダル（useConfirm）が Sheet からも使えるよう、ConfirmProvider で
              MenuProvider ごと包む。 */}
          {/* 全ページ共通の pull-to-refresh（standalone のみ）。一覧ページは
              useRegisterPullToRefresh で in-place 更新を登録、未登録ページはリロード。 */}
          <PullToRefreshProvider>
          <ConfirmProvider>
            {/* 通知の未読状態はページごとに1回だけ取得して共有する（ベル＝NotificationBell と
                PCレール＝AppRail が同時マウントで二重取得していたのを集約）。両者を子に含むよう
                MenuProvider ごと包む。 */}
            <NotificationsProvider enabled={claims != null}>
            <MenuProvider
              isLoggedIn={claims != null}
              isAdmin={isAdminUser}
              selfSegment={selfSegment}
              username={claims?.username ?? null}
              instanceDomain={claims?.instanceDomain ?? null}
              avatarUrl={getAvatarUrl(claims?.avatarUrl)}
            >
              {/* PC幅（md+）は右端をメニューの折りたたみレール（AppRail）専用列として確保する。
                  レール本体は AppRail（MenuProvider 内）が `fixed right-0` の幅60pxで描画し、
                  ここで同じ幅ぶん右パディングを空けてコンテンツが重ならないようにする。
                  幅を変える場合は AppMenu の RAIL_COLLAPSED と必ず合わせること。 */}
              <div className="md:pr-[60px]">{children}</div>
              {/* 下部ナビはログイン時のみ描画。未ログインはヘッダー（ハンバーガー＋
                  「投稿をはじめる」）に導線を集約し、下部バーのビジーさを避ける。
                  表示条件のCSS（モバイル常時／standalone）は BottomNav 側が持つ。 */}
              {claims != null && (
                <Suspense fallback={null}>
                  <BottomNav
                    selfSegment={selfSegment}
                    instanceDomain={claims?.instanceDomain ?? null}
                    avatarUrl={getAvatarUrl(claims?.avatarUrl)}
                  />
                </Suspense>
              )}
            </MenuProvider>
            </NotificationsProvider>
          </ConfirmProvider>
          <Toaster />
          </PullToRefreshProvider>
          <ServiceWorkerRegister />
        </ThemeProvider>
        </HomeServerProvider>
      </body>
    </html>
  );
}
