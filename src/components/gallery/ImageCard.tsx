"use client";

import { useState } from "react";
import Link from "next/link";
import { ThumbnailImage } from "./ThumbnailImage";

interface ImageCardProps {
  image: {
    id: string;
    storageKey: string;
    width: number;
    height: number;
    overlayText: string;
    position: string;
    createdAt: string;
  };
  publicUrl: string;
  username?: string;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
}

export function ImageCard({ image, publicUrl, username, showDelete, onDelete }: ImageCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const imageUrl = `${publicUrl}/${image.storageKey}`;
  const detailUrl = username ? `/u/${username}/status/${image.id}` : imageUrl;

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("この画像を削除しますか？")) return;

    setIsDeleting(true);
    try {
      await onDelete(image.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="group relative bg-muted rounded-lg overflow-hidden">
      <Link href={detailUrl} target={username ? undefined : "_blank"} rel={username ? undefined : "noopener noreferrer"} className="block">
        <ThumbnailImage
          src={imageUrl}
          alt={image.overlayText}
          position={image.position}
          className="group-hover:opacity-90 transition-opacity"
        />
      </Link>
      {showDelete && onDelete && (
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          aria-label="削除"
        >
          {isDeleting ? "..." : "×"}
        </button>
      )}
    </div>
  );
}
