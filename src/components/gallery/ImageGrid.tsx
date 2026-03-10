"use client";

import { ImageCard } from "./ImageCard";

interface ImageGridProps {
  images: Array<{
    id: string;
    storageKey: string;
    width: number;
    height: number;
    overlayText: string;
    createdAt: string;
  }>;
  publicUrl: string;
  username?: string;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
}

export function ImageGrid({ images, publicUrl, username, showDelete, onDelete }: ImageGridProps) {
  if (images.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        まだ画像がありません
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          publicUrl={publicUrl}
          username={username}
          showDelete={showDelete}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
