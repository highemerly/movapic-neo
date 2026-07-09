import { Suspense } from "react";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { getSessionClaims } from "@/lib/auth/session";
import { LoginButton } from "@/components/auth/LoginButton";
import { LoginSection } from "@/components/auth/LoginSection";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { FeaturedMarquee } from "@/components/gallery/FeaturedMarquee";
import { Footer } from "@/components/Footer";
import { getAllowedServers } from "@/lib/auth/allowedServers";
import { userPathSegment } from "@/lib/userHandle";

// ログイン判定（getSessionClaims）で cookie を読むためページは動的になる。
// 公開ギャラリーのクエリは unstable_cache で 5 分キャッシュし、全訪問者で共有する。
// （cacheComponents 未有効のため 'use cache' は使えず unstable_cache が正解）
const getFeaturedImages = unstable_cache(
  async () =>
    prisma.image.findMany({
      where: { isPublic: true, isDisabled: false },
      orderBy: { createdAt: "desc" },
      take: 16,
      select: {
        id: true,
        storageKey: true,
        overlayText: true,
        altText: true,
        position: true,
        user: {
          select: {
            username: true,
            instance: { select: { domain: true } },
          },
        },
      },
    }),
  ["home-featured-images"],
  { revalidate: 300, tags: ["featured-images"] }
);

export default async function HomePage() {
  const allowedServers = getAllowedServers();
  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // ログイン状態は JWT（署名+exp検証のみ）で判定＝DBアクセスなし
  const isLoggedIn = (await getSessionClaims()) !== null;

  // フィーチャー画像を取得（最新16件・5分キャッシュ）
  const featuredImages = await getFeaturedImages();
  const marqueeImages = featuredImages.map((image) => ({
    id: image.id,
    storageKey: image.storageKey,
    overlayText: image.overlayText,
    altText: image.altText,
    position: image.position,
    username: userPathSegment(image.user.username, image.user.instance.domain),
  }));

  return (
    <div className="min-h-screen bg-background">
      <main className="py-6">
        {/* ロゴ */}
        <div className="container mx-auto max-w-2xl px-4">
          <div className="flex justify-center">
            <Image src="/shamezo_logo_with_tagline.svg" alt="SHAMEZO" width={340} height={76} className="h-auto w-auto max-w-full" priority />
          </div>
        </div>

        {/* 作例（ロゴ直下に横並びで自動スクロール） */}
        {marqueeImages.length > 0 && (
          <div className="mt-5">
            <FeaturedMarquee images={marqueeImages} publicUrl={publicUrl} />
          </div>
        )}

        {/* ログイン（保護ページからのリダイレクト時はバナー表示） */}
        <div className="container mx-auto max-w-2xl px-4">
          {/* ログインカードは画像詳細ページのガイドと同じ幅（max-w-2xl のコンテナ全幅）。
              見出し〜「他のユーザーの投稿を見てみる」まで一枚のカード内に収める（LoginSection が担当）。 */}
          <div className="mt-6">
            {/* 保護ページ由来のバナー表示のため LoginSection を使う。バナー判定に useSearchParams を
                使うので Suspense 必須。フォールバックはバナーなしの同型カード（LoginPrompt）で描く。 */}
            <Suspense
              fallback={
                <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-left">
                  <div className="px-5 py-5">
                    <LoginPrompt showPrompt={!isLoggedIn}>
                      <LoginButton allowedServers={allowedServers} initialIsLoggedIn={isLoggedIn} />
                    </LoginPrompt>
                  </div>
                </div>
              }
            >
              <LoginSection allowedServers={allowedServers} initialIsLoggedIn={isLoggedIn} />
            </Suspense>
          </div>

          {/* フッター */}
          <Footer />
        </div>
      </main>
    </div>
  );
}
