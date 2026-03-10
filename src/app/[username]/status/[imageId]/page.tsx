import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    username: string;
    imageId: string;
  }>;
}

export default async function ImageDetailPage({ params }: PageProps) {
  const { username, imageId } = await params;

  // ログインユーザーを取得
  const currentUser = await getCurrentUser();

  // 画像を取得（ユーザー情報も含む）
  const image = await prisma.image.findUnique({
    where: { id: imageId },
    include: {
      user: {
        include: {
          instance: true,
        },
      },
    },
  });

  // 画像が見つからない、または非公開の場合
  if (!image || !image.isPublic) {
    notFound();
  }

  // ユーザー名が一致しない場合
  if (image.user.username !== username) {
    notFound();
  }

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const imageUrl = `${publicUrl}/${image.storageKey}`;

  // 自分の画像かどうか
  const isOwner = currentUser?.id === image.userId;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <Link href={`/${username}`}>
            <Button variant="ghost" size="sm">
              ← {image.user.displayName || username} のギャラリーに戻る
            </Button>
          </Link>
        </div>

        {/* 画像 */}
        <div className="mb-6">
          <div className="rounded-lg overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={image.overlayText}
              className="w-full object-contain"
            />
          </div>
        </div>

        {/* 投稿者情報 */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-muted rounded-lg">
          {image.user.avatarUrl && (
            <Link href={`/${username}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.user.avatarUrl}
                alt={image.user.displayName || image.user.username}
                className="w-12 h-12 rounded-full hover:opacity-80 transition-opacity"
              />
            </Link>
          )}
          <div>
            <Link
              href={`/${username}`}
              className="font-semibold hover:underline"
            >
              {image.user.displayName || image.user.username}
            </Link>
            <a
              href={`https://${image.user.instance.domain}/@${image.user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted-foreground hover:underline"
            >
              @{image.user.username}@{image.user.instance.domain}
            </a>
          </div>
        </div>

        {/* テキスト */}
        <div className="mb-6">
          <p className="text-lg whitespace-pre-wrap">{image.overlayText}</p>
        </div>

        {/* メタ情報 */}
        <div className="text-sm text-muted-foreground">
          <p>
            {new Date(image.createdAt).toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* 削除ボタン（自分の画像のみ） */}
        {isOwner && (
          <div className="mt-8 pt-6 border-t">
            <DeleteButton imageId={imageId} username={username} />
          </div>
        )}

        {/* フッター */}
        <footer className="mt-12 pt-8 border-t text-center">
          <Link href="/">
            <Button variant="outline">写真に文字を合成するやつ（仮）</Button>
          </Link>
        </footer>
      </main>
    </div>
  );
}
