import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/layout/BottomNav";
import { MenuProvider } from "@/components/layout/AppMenu";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PullToRefresh } from "@/components/PullToRefresh";
import { getSessionClaims } from "@/lib/auth/session";
import { userPathSegment, DEFAULT_INSTANCE } from "@/lib/userHandle";
import { getAvatarUrl } from "@/lib/avatar";
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
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
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
// React実行前のブロッキングscriptでDOMを変えるためハイドレーション不整合・フラッシュは出ない。
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
  const selfSegment = claims?.username
    ? userPathSegment(claims.username, claims.instanceDomain || DEFAULT_INSTANCE)
    : null;

  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: STANDALONE_DETECT_SCRIPT }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
          <ConfirmProvider>
            <MenuProvider
              isLoggedIn={claims != null}
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
              {/* PWA（standalone起動）時のみCSSで表示される下部ナビ */}
              <Suspense fallback={null}>
                <BottomNav
                  selfSegment={selfSegment}
                  instanceDomain={claims?.instanceDomain ?? null}
                  avatarUrl={getAvatarUrl(claims?.avatarUrl)}
                />
              </Suspense>
            </MenuProvider>
          </ConfirmProvider>
          <Toaster />
          {/* iOS PWA（standalone）専用の引っ張って更新。Androidはネイティブ任せ */}
          <PullToRefresh />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
