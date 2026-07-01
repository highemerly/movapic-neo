"use client";

import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import {
  TimelineImageCard,
  type TimelineCardImage,
} from "@/components/gallery/TimelineImageCard";
import { useInfiniteImages } from "@/hooks/useInfiniteImages";

type FavoriteImage = TimelineCardImage;

interface FavoritesClientProps {
  initialImages: FavoriteImage[];
  publicUrl: string;
  initialCursor: string | null;
}

export function FavoritesClient({
  initialImages,
  publicUrl,
  initialCursor,
}: FavoritesClientProps) {
  const { images, isLoading, nextCursor, loaderRef } = useInfiniteImages<FavoriteImage>({
    initialImages,
    initialCursor,
    fetchPage: async (cursor) => {
      const response = await fetch(`/api/v1/favorites?cursor=${cursor}&limit=20`);
      if (!response.ok) throw new Error("Failed to load more");
      return response.json();
    },
    // 再前面化／bfcache 復元時に先頭ページを取り直す（iOS PWA の古い表示対策）。
    fetchFirstPage: async () => {
      const response = await fetch(`/api/v1/favorites?limit=20`);
      if (!response.ok) throw new Error("Failed to refresh");
      return response.json();
    },
  });

  return (
    <GalleryGrid
      images={images}
      getKey={(image) => image.id}
      aspect={(image) => image.width / image.height}
      emptyMessage="まだお気に入りに登録した画像がありません"
      endMessage="すべてのお気に入りを表示しました"
      isLoading={isLoading}
      nextCursor={nextCursor}
      loaderRef={loaderRef}
      renderItem={(image, fill) => (
        <TimelineImageCard image={image} publicUrl={publicUrl} fill={fill} />
      )}
    />
  );
}
