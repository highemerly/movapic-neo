"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";

interface TimelineImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  position: string;
  createdAt: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    instance: string;
  };
}

interface PublicTimelineClientProps {
  initialImages: TimelineImage[];
  publicUrl: string;
}

export function PublicTimelineClient({
  initialImages,
  publicUrl,
}: PublicTimelineClientProps) {
  const [images, setImages] = useState(initialImages);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialImages.length >= 20 ? initialImages[initialImages.length - 1]?.id : null
  );

  const loadMore = async () => {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/public/timeline?cursor=${nextCursor}&limit=20`
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
  };

  if (images.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        まだ画像が投稿されていません
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
        {images.map((image) => (
          <TimelineImageCard key={image.id} image={image} publicUrl={publicUrl} />
        ))}
      </div>

      {nextCursor && (
        <div className="mt-8 text-center">
          <Button onClick={loadMore} disabled={isLoading} variant="outline">
            {isLoading ? "読み込み中..." : "もっと見る"}
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineImageCard({
  image,
  publicUrl,
}: {
  image: TimelineImage;
  publicUrl: string;
}) {
  const imageUrl = `${publicUrl}/${image.storageKey}`;

  const detailUrl = `/u/${image.user.username}/status/${image.id}`;

  return (
    <Link href={detailUrl} className="block relative rounded-lg overflow-hidden group">
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
    </Link>
  );
}
