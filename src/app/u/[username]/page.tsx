import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { UserGalleryClient } from "./UserGalleryClient";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { UserProfileHeader } from "@/components/user/UserProfileHeader";

export const dynamic = "force-dynamic";

interface UserGalleryPageProps {
  params: Promise<{ username: string }>;
}

export default async function UserGalleryPage({ params }: UserGalleryPageProps) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  // @を除去（URLで /@username の形式でアクセスされた場合）
  const cleanUsername = username.startsWith("@") ? username.slice(1) : username;

  // ユーザーを取得（handon.club限定）
  const user = await prisma.user.findFirst({
    where: {
      username: cleanUsername,
      instance: {
        domain: process.env.MASTODON_INSTANCE || "handon.club",
      },
    },
    include: {
      instance: true,
    },
  });

  if (!user) {
    notFound();
  }

  // ピン留め画像を取得（最大4つ、pinnedAtの降順）
  const pinnedImages = await prisma.image.findMany({
    where: {
      userId: user.id,
      isPublic: true,
      pinnedAt: { not: null },
    },
    orderBy: { pinnedAt: "desc" },
    select: {
      id: true,
      storageKey: true,
      width: true,
      height: true,
      overlayText: true,
      position: true,
      favoriteCount: true,
      pinnedAt: true,
      createdAt: true,
    },
  });

  const pinnedImageIds = pinnedImages.map((img) => img.id);

  // 通常の公開画像を取得（ピン留め画像を除く）
  const images = await prisma.image.findMany({
    where: {
      userId: user.id,
      isPublic: true,
      id: { notIn: pinnedImageIds },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      storageKey: true,
      width: true,
      height: true,
      overlayText: true,
      position: true,
      favoriteCount: true,
      pinnedAt: true,
      createdAt: true,
    },
  });

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // 総画像数を取得
  const totalImageCount = await prisma.image.count({
    where: {
      userId: user.id,
      isPublic: true,
    },
  });

  return (
    <>
      <SiteHeader user={currentUser ? { username: currentUser.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <UserProfileHeader
          user={{
            username: cleanUsername,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
            createdAt: user.createdAt.toISOString(),
            instance: { domain: user.instance.domain },
          }}
          imageCount={totalImageCount}
          activeTab="photos"
        />

        {/* 画像一覧（ピン留め画像を先頭に） */}
        <UserGalleryClient
          initialImages={[
            ...pinnedImages.map((img) => ({
              ...img,
              pinnedAt: img.pinnedAt?.toISOString() ?? null,
              createdAt: img.createdAt.toISOString(),
            })),
            ...images.map((img) => ({
              ...img,
              pinnedAt: img.pinnedAt?.toISOString() ?? null,
              createdAt: img.createdAt.toISOString(),
            })),
          ]}
          publicUrl={publicUrl}
          username={cleanUsername}
          pinnedImageIds={pinnedImageIds}
        />

        <Footer />
      </div>
    </>
  );
}
