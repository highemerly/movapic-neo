"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";
import { FavoriteOverlay } from "@/components/favorite/FavoriteOverlay";

interface FavoriteImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  position: string;
  favoriteCount: number;
  createdAt: string;
  favoritedAt: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    instance: string;
  };
}

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
  const [images, setImages] = useState(initialImages);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const loaderRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/favorites?cursor=${nextCursor}&limit=20`
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
  }, [nextCursor, isLoading]);

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
        まだお気に入りに登録した画像がありません
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
        {images.map((image) => (
          <FavoriteImageCard
            key={image.id}
            image={image}
            publicUrl={publicUrl}
          />
        ))}
      </div>

      {/* 無限スクロール用のローダー */}
      <div ref={loaderRef} className="mt-8 text-center py-4">
        {isLoading && (
          <span className="text-muted-foreground">読み込み中...</span>
        )}
        {!nextCursor && images.length > 0 && (
          <span className="text-muted-foreground text-sm">
            すべてのお気に入りを表示しました
          </span>
        )}
      </div>
    </div>
  );
}

function FavoriteImageCard({
  image,
  publicUrl,
}: {
  image: FavoriteImage;
  publicUrl: string;
}) {
  const imageUrl = `${publicUrl}/${image.storageKey}`;
  const detailUrl = `/u/${image.user.username}/status/${image.id}`;

  return (
    <Link
      href={detailUrl}
      className="block relative rounded-lg overflow-hidden group"
    >
      <ThumbnailImage
        src={imageUrl}
        alt={image.overlayText}
        position={image.position}
        className="group-hover:opacity-90 transition-opacity"
      />
      {/* 投稿者オーバーレイ */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4 flex items-center gap-1.5">
        {image.user.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.user.avatarUrl}
            alt={image.user.displayName || image.user.username}
            className="w-5 h-5 rounded-full"
          />
        )}
        <span className="text-xs text-white truncate">
          {image.user.displayName || image.user.username}
        </span>
      </div>
      {/* お気に入り数オーバーレイ */}
      <FavoriteOverlay count={image.favoriteCount} />
    </Link>
  );
}
