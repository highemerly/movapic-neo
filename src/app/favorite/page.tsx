import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ImagePlus } from "lucide-react";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { FavoritesClient } from "./FavoritesClient";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function FavoritePage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/?reason=login_required&returnTo=%2Ffavorite");
  }

  // best-effort: favoritersCache に自分のacctが含まれる画像を一覧
  const viewerAcct = `${currentUser.username}@${currentUser.instance.domain}`;
  const images = await prisma.image.findMany({
    where: {
      isPublic: true,
      favoritersCache: {
        array_contains: [{ acct: viewerAcct }] as Prisma.InputJsonValue,
      },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
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
          instance: { select: { domain: true } },
        },
      },
    },
  });

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  return (
    <>
      <SiteHeader user={{ username: currentUser.username }} />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">お気に入り</h1>
          <Link href="/create">
            <Button size="sm">
              <ImagePlus className="h-4 w-4" />
              写真を投稿
            </Button>
          </Link>
        </div>

        <FavoritesClient
          initialImages={images.map((image) => ({
            id: image.id,
            storageKey: image.storageKey,
            width: image.width,
            height: image.height,
            overlayText: image.overlayText,
            position: image.position,
            favoriteCount: image.favoriteCount,
            createdAt: image.createdAt.toISOString(),
            user: {
              username: image.user.username,
              displayName: image.user.displayName,
              avatarUrl: getAvatarUrl(image.user.avatarUrl),
              instance: image.user.instance.domain,
            },
          }))}
          publicUrl={publicUrl}
          initialCursor={images.length >= PAGE_SIZE ? images[images.length - 1]?.id : null}
        />

        <Footer />
      </div>
    </>
  );
}
