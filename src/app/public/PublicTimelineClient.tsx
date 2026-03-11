"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface TimelineImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
    <div className="bg-muted rounded-lg overflow-hidden">
      <Link href={detailUrl}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={image.overlayText}
          className="w-full h-auto aspect-square object-cover hover:opacity-90 transition-opacity"
          loading="lazy"
        />
      </Link>
      <div className="p-3">
        <Link href={detailUrl} className="hover:underline">
          <p className="text-sm line-clamp-2 mb-2">{image.overlayText}</p>
        </Link>
        <div className="flex items-center gap-2">
          {image.user.avatarUrl && (
            <Link href={`/u/${image.user.username}`} className="hover:opacity-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.user.avatarUrl}
                alt={image.user.displayName || image.user.username}
                className="w-6 h-6 rounded-full"
              />
            </Link>
          )}
          <a
            href={`https://${image.user.instance}/@${image.user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:underline"
          >
            @{image.user.username}
          </a>
        </div>
      </div>
    </div>
  );
}
