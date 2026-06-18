"use client";

import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import {
  TimelineImageCard,
  type TimelineCardImage,
} from "@/components/gallery/TimelineImageCard";
import { useInfiniteImages } from "@/hooks/useInfiniteImages";

type TimelineImage = TimelineCardImage;

interface PublicTimelineClientProps {
  initialImages: TimelineImage[];
  publicUrl: string;
  /** サーバー絞り込みパラメータ（カンマ区切り）。未指定なら null */
  instancesParam: string | null;
}

export function PublicTimelineClient({
  initialImages,
  publicUrl,
  instancesParam,
}: PublicTimelineClientProps) {
  const { images, isLoading, nextCursor, loaderRef } = useInfiniteImages<TimelineImage>({
    initialImages,
    initialCursor:
      initialImages.length >= 20
        ? initialImages[initialImages.length - 1]?.id ?? null
        : null,
    fetchPage: async (cursor) => {
      const params = new URLSearchParams({ cursor, limit: "20" });
      if (instancesParam) params.set("instances", instancesParam);
      const response = await fetch(`/api/v1/public/timeline?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load more");
      return response.json();
    },
  });

  return (
    <GalleryGrid
      images={images}
      getKey={(image) => image.id}
      aspect={(image) => image.width / image.height}
      emptyMessage="まだ画像が投稿されていません"
      endMessage="すべての画像を表示しました"
      isLoading={isLoading}
      nextCursor={nextCursor}
      loaderRef={loaderRef}
      renderItem={(image, fill) => (
        <TimelineImageCard
          image={image}
          publicUrl={publicUrl}
          fill={fill}
          from="public"
        />
      )}
    />
  );
}
