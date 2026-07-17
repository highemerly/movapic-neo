import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";
import { LoginButton } from "@/components/auth/LoginButton";
import { LoginSection } from "@/components/auth/LoginSection";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { FeaturedMarquee } from "@/components/gallery/FeaturedMarquee";
import { AboutShamezo } from "@/components/onboarding/AboutShamezo";
import { Footer } from "@/components/Footer";
import { SessionFlasher } from "@/components/SessionFlasher";
import { getAllowedServers } from "@/lib/auth/allowedServers";
import { userPathSegment } from "@/lib/userHandle";

// マーキーに流す枚数と、スコアリング元になる候補プールの上限。
// プールから「お気に入り×新しさ」でスコアし、投稿者1人1枚に間引いて上位 MARQUEE_COUNT 枚を選ぶ。
const MARQUEE_COUNT = 16;
const CANDIDATE_POOL = 240;
// 時間減衰の強さ。大きいほど新しさ重視（古い人気作が居座りにくい）。
const RECENCY_GRAVITY = 1.2;

// お気に入り数と投稿からの経過日数を合成したスコア。
// favoriteCount / (経過日数 + 2)^gravity。分母の +2 で投稿直後の過度な優遇を抑える。
// 候補は favoriteCount>=1 に絞ってあるので分子は常に1以上（お気に入り0＝未評価は除外済み）。
// 古い写真は多くのお気に入りがないと上位に来ない。
function featuredScore(favoriteCount: number, createdAt: Date, now: number): number {
  const ageDays = Math.max(0, (now - createdAt.getTime()) / 86_400_000);
  return favoriteCount / Math.pow(ageDays + 2, RECENCY_GRAVITY);
}

// ログイン判定（getSessionClaims）で cookie を読むためページは動的になる。
// 公開ギャラリーのクエリは unstable_cache で 5 分キャッシュし、全訪問者で共有する。
// （cacheComponents 未有効のため 'use cache' は使えず unstable_cache が正解）
const getFeaturedImages = unstable_cache(
  async () => {
    // 候補プール（最新順に多めに取得）。この母集団の中でスコアリング＆投稿者間引きを行う。
    // favoriteCount>=1 でお気に入り0を除外＝お気に入りは Mastodon 投稿にしか付かないため、
    // Fediverse に投稿され最低1つお気に入りが付いた写真だけが対象になる（local投稿は必ず除外）。
    const candidates = await prisma.image.findMany({
      where: { isPublic: true, isDisabled: false, favoriteCount: { gte: 1 } },
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_POOL,
      select: {
        id: true,
        userId: true,
        favoriteCount: true,
        createdAt: true,
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
    });

    const now = Date.now();
    // 投稿者ごとに最高スコアの1枚だけを残す（同じ人の写真が並ばないように）。
    const bestByUser = new Map<string, { image: (typeof candidates)[number]; score: number }>();
    for (const image of candidates) {
      const score = featuredScore(image.favoriteCount, image.createdAt, now);
      const current = bestByUser.get(image.userId);
      if (!current || score > current.score) {
        bestByUser.set(image.userId, { image, score });
      }
    }

    return Array.from(bestByUser.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, MARQUEE_COUNT)
      .map(({ image }) => image);
  },
  ["home-featured-images"],
  { revalidate: 300, tags: ["featured-images"] }
);

export default async function HomePage() {
  const allowedServers = getAllowedServers();
  const publicUrl = (process.env.S3_PUBLIC_URL || "").replace(/\/+$/, "");

  // ログイン状態は DB照合（getCurrentUser）で判定する。
  // トップページはログイン導線の着地点なので、ここだけは JWT を信用せず
  // 「DB上でセッションが生きているか」を権威として使う。これを JWT(claims) だけで
  // 判定すると、スライディングで延命された「JWTは有効だがDBセッションは失効」な
  // Cookie を持つ端末に対してログインフォームを出せず、ゲートページ↔/ の無限ループに陥る。
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    // Cookieは存在するのに未認証＝食い違い状態。Cookieを掃除して整合させる。
    const hasSessionCookie = (await cookies()).has(SESSION_COOKIE_NAME);
    if (hasSessionCookie) {
      redirect("/api/auth/reconcile");
    }
  }
  const isLoggedIn = currentUser !== null;
  // ログイン済みユーザーがトップのログインフォームを押したときの戻り先（自分のユーザーページ）。
  const loggedInHref = currentUser
    ? `/u/${userPathSegment(currentUser.username, currentUser.instance.domain)}`
    : undefined;

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
      {/* ログアウト（フルリロードで着地）時に sessionStorage 経由で一度だけトーストを出す。 */}
      <SessionFlasher storageKey="flash:loggedOut" />
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
                    {!isLoggedIn && <AboutShamezo />}
                    <LoginPrompt showPrompt={!isLoggedIn}>
                      <LoginButton allowedServers={allowedServers} loggedInHref={loggedInHref} initialIsLoggedIn={isLoggedIn} />
                    </LoginPrompt>
                  </div>
                </div>
              }
            >
              <LoginSection allowedServers={allowedServers} initialIsLoggedIn={isLoggedIn} loggedInHref={loggedInHref} />
            </Suspense>
          </div>

          {/* フッター */}
          <Footer />
        </div>
      </main>
    </div>
  );
}
