"use client";

import { ImageCard } from "./ImageCard";
import { EmptyState } from "@/components/ui/empty-state";

interface ImageGridProps {
  images: Array<{
    id: string;
    storageKey: string;
    width: number;
    height: number;
    overlayText: string;
    position: string;
    createdAt: string;
  }>;
  publicUrl: string;
  username?: string;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
}

export function ImageGrid({ images, publicUrl, username, showDelete, onDelete }: ImageGridProps) {
  if (images.length === 0) {
    return <EmptyState message="まだ画像がありません" />;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
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
