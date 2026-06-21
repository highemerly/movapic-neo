import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/layout/BottomNav";
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConfirmProvider>{children}</ConfirmProvider>
          <Toaster />
          {/* iOS PWA（standalone）専用の引っ張って更新。Androidはネイティブ任せ */}
          <PullToRefresh />
          {/* PWA（standalone起動）時のみCSSで表示される下部ナビ */}
          <Suspense fallback={null}>
            <BottomNav
              selfSegment={selfSegment}
              instanceDomain={claims?.instanceDomain ?? null}
              avatarUrl={getAvatarUrl(claims?.avatarUrl)}
            />
          </Suspense>
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
