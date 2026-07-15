"use client";

import { ImagePlus } from "lucide-react";
import Link from "@/components/Link";
import { Button } from "@/components/ui/button";
import { ImageCard } from "@/components/gallery/ImageCard";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { useInfiniteImages } from "@/hooks/useInfiniteImages";

interface GalleryImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  altText?: string | null;
  position: string;
  size: string;
  blurDataUrl?: string | null;
  favoriteCount: number;
  pinnedAt: string | null;
  createdAt: string;
}

interface UserGalleryClientProps {
  initialImages: GalleryImage[];
  publicUrl: string;
  username: string;
  pinnedImageIds?: string[];
  /** 閲覧者がこのページのオーナー本人か（空状態のCTA表示に使用） */
  isOwner?: boolean;
}

export function UserGalleryClient({
  initialImages,
  publicUrl,
  username,
  pinnedImageIds = [],
  isOwner = false,
}: UserGalleryClientProps) {
  const { images, isLoading, nextCursor, loaderRef } = useInfiniteImages<GalleryImage>({
    initialImages,
    initialCursor:
      initialImages.length >= 20
        ? initialImages[initialImages.length - 1]?.id ?? null
        : null,
    dedupe: true,
    fetchPage: async (cursor) => {
      const response = await fetch(
        `/api/v1/public/users/${username}/images?cursor=${cursor}&limit=20`
      );
      if (!response.ok) throw new Error("Failed to load more");
      return response.json();
    },
  });

  return (
    <GalleryGrid
      images={images}
      getKey={(image) => image.id}
      aspect={(image) => image.width / image.height}
      emptyMessage="まだ画像がありません"
      emptyAction={
        isOwner ? (
          <Link href="/create" className="inline-block">
            <Button
              size="lg"
              className="h-12 px-8 bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <ImagePlus className="mr-2 h-5 w-5" />
              写真を投稿する
            </Button>
          </Link>
        ) : undefined
      }
      endMessage="すべての画像を表示しました"
      isLoading={isLoading}
      nextCursor={nextCursor}
      loaderRef={loaderRef}
      renderItem={(image, fill) => (
        <ImageCard
          image={image}
          publicUrl={publicUrl}
          username={username}
          isPinned={pinnedImageIds.includes(image.id)}
          fill={fill}
        />
      )}
    />
  );
}
