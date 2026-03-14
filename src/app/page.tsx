import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { LoginButton } from "@/components/auth/LoginButton";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

// 許可サーバーを取得
function getAllowedServers(): string[] | undefined {
  const allowed = process.env.ALLOWED_SERVERS;
  if (!allowed || allowed.trim() === "") {
    return undefined;
  }
  return allowed.split(",").map((s) => s.trim().toLowerCase());
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const allowedServers = getAllowedServers();
  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // フィーチャー画像を取得（ランダムに6件）
  const totalCount = await prisma.image.count({
    where: { isPublic: true },
  });

  let featuredImages: {
    id: string;
    storageKey: string;
    overlayText: string;
    user: {
      username: string;
      displayName: string | null;
    };
  }[] = [];

  if (totalCount > 0) {
    const maxOffset = Math.max(0, totalCount - 6);
    const randomOffset = Math.floor(Math.random() * (maxOffset + 1));

    const images = await prisma.image.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      skip: randomOffset,
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
    });

    // シャッフル
    featuredImages = images.sort(() => Math.random() - 0.5);
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-6">
        {/* ヘッダー */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-4">写真に文字を合成するやつ（仮）</h1>

          {/* ログインボタン / ユーザーメニュー */}
          <div className="max-w-sm mx-auto mt-8 mb-8">
            {user ? (
              <div className="flex flex-col gap-3">
                <Link href={`/u/${user.username}`}>
                  <Button className="w-full py-6 text-lg" size="lg">
                    わたしの写真
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" className="w-full py-6 text-lg" size="lg">
                    ダッシュボード
                  </Button>
                </Link>
              </div>
            ) : (
              <LoginButton allowedServers={allowedServers} />
            )}
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
