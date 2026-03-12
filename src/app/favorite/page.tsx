import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { FavoritesClient } from "./FavoritesClient";
import { SiteHeader } from "@/components/layout/SiteHeader";

export const dynamic = "force-dynamic";

export default async function FavoritePage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/");
  }

  // お気に入り一覧を取得
  const favorites = await prisma.favorite.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      image: {
        select: {
          id: true,
          storageKey: true,
          width: true,
          height: true,
          overlayText: true,
          position: true,
          favoriteCount: true,
          createdAt: true,
          user: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
              instance: {
                select: {
                  domain: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  return (
    <>
      <SiteHeader user={{ username: currentUser.username }} />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-2xl font-bold mb-8">お気に入り</h1>

        <FavoritesClient
          initialImages={favorites.map((fav) => ({
            id: fav.image.id,
            storageKey: fav.image.storageKey,
            width: fav.image.width,
            height: fav.image.height,
            overlayText: fav.image.overlayText,
            position: fav.image.position,
            favoriteCount: fav.image.favoriteCount,
            createdAt: fav.image.createdAt.toISOString(),
            favoritedAt: fav.createdAt.toISOString(),
            user: {
              username: fav.image.user.username,
              displayName: fav.image.user.displayName,
              avatarUrl: fav.image.user.avatarUrl,
              instance: fav.image.user.instance.domain,
            },
          }))}
          publicUrl={publicUrl}
          initialCursor={favorites.length >= 20 ? favorites[favorites.length - 1]?.id : null}
        />
      </div>
    </>
  );
}
