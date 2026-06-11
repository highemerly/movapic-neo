import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { getSessionClaims } from "@/lib/auth/session";
import { LoginButton } from "@/components/auth/LoginButton";
import { LoginSection } from "@/components/auth/LoginSection";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";
import { Footer } from "@/components/Footer";

// ログイン判定（getSessionClaims）で cookie を読むためページは動的になる。
// 公開ギャラリーのクエリは unstable_cache で 5 分キャッシュし、全訪問者で共有する。
// （cacheComponents 未有効のため 'use cache' は使えず unstable_cache が正解）
const getFeaturedImages = unstable_cache(
  async () =>
    prisma.image.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        storageKey: true,
        overlayText: true,
        user: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
    }),
  ["home-featured-images"],
  { revalidate: 300, tags: ["featured-images"] }
);

// 許可サーバーを取得
function getAllowedServers(): string[] | undefined {
  const allowed = process.env.ALLOWED_SERVERS;
  if (!allowed || allowed.trim() === "") {
    return undefined;
  }
  return allowed.split(",").map((s) => s.trim().toLowerCase());
}

export default async function HomePage() {
  const allowedServers = getAllowedServers();
  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // ログイン状態は JWT（署名+exp検証のみ）で判定＝DBアクセスなし
  const isLoggedIn = (await getSessionClaims()) !== null;

  // フィーチャー画像を取得（最新6件・5分キャッシュ）
  const featuredImages = await getFeaturedImages();

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-6">
        {/* ヘッダー */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <Image src="/shamezo_logo_with_tagline.svg" alt="SHAMEZO" width={340} height={76} className="h-auto w-auto max-w-full" priority />
          </div>

          {/* ログインボタン（保護ページからのリダイレクト時はバナー表示） */}
          <div className="max-w-sm mx-auto mt-6 mb-8">
            <Suspense
              fallback={
                <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-center">
                  <div className="px-5 py-5">
                    <LoginButton allowedServers={allowedServers} initialIsLoggedIn={isLoggedIn} />
                  </div>
                </div>
              }
            >
              <LoginSection allowedServers={allowedServers} initialIsLoggedIn={isLoggedIn} />
            </Suspense>
          </div>
        </div>

        {/* フィーチャー画像 */}
        {featuredImages.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-center mb-4 text-muted-foreground">
              みんなの作品
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {featuredImages.map((image) => (
                <Link
                  key={image.id}
                  href={`/u/${image.user.username}/status/${image.id}`}
                  className="block bg-muted rounded-lg overflow-hidden"
                >
                  <ThumbnailImage
                    src={`${publicUrl}/${image.storageKey}`}
                    alt={image.overlayText}
                    loading="eager"
                    className="hover:opacity-90 transition-opacity"
                  />
                </Link>
              ))}
            </div>
            <div className="text-center mt-6">
              <Link href="/public">
                <Button variant="outline">もっと見る</Button>
              </Link>
            </div>
          </div>
        )}

        {/* フッター */}
        <Footer />
      </main>
    </div>
  );
}
