"use client";

import { ImageCard } from "@/components/gallery/ImageCard";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { useInfiniteImages } from "@/hooks/useInfiniteImages";

interface GalleryImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  position: string;
  size: string;
  favoriteCount: number;
  pinnedAt: string | null;
  createdAt: string;
}

interface UserGalleryClientProps {
  initialImages: GalleryImage[];
  publicUrl: string;
  username: string;
  pinnedImageIds?: string[];
}

export function UserGalleryClient({
  initialImages,
  publicUrl,
  username,
  pinnedImageIds = [],
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
