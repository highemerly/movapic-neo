"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ImageCard } from "@/components/gallery/ImageCard";

interface GalleryImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  position: string;
  favoriteCount: number;
  createdAt: string;
}

interface UserGalleryClientProps {
  initialImages: GalleryImage[];
  publicUrl: string;
  username: string;
}

export function UserGalleryClient({
  initialImages,
  publicUrl,
  username,
}: UserGalleryClientProps) {
  const [images, setImages] = useState(initialImages);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialImages.length >= 20 ? initialImages[initialImages.length - 1]?.id : null
  );
  const loaderRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/public/users/${username}/images?cursor=${nextCursor}&limit=20`
      );
      if (!response.ok) throw new Error("Failed to load more");

      const data = await response.json();
      setImages((prev) => [...prev, ...data.images]);
      setNextCursor(data.hasMore ? data.nextCursor : null);
    } catch (error) {
      console.error("Load more error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, username]);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader || !nextCursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(loader);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

  if (images.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        まだ画像がありません
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
        {images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            publicUrl={publicUrl}
            username={username}
          />
        ))}
      </div>

      {/* 無限スクロール用のローダー */}
      <div ref={loaderRef} className="mt-8 text-center py-4">
        {isLoading && (
          <span className="text-muted-foreground">読み込み中...</span>
        )}
        {!nextCursor && images.length > 0 && (
          <span className="text-muted-foreground text-sm">すべての画像を表示しました</span>
        )}
      </div>
    </div>
  );
}
