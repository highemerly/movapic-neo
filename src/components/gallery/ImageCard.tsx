"use client";

import { useState } from "react";
import Link from "next/link";

interface ImageCardProps {
  image: {
    id: string;
    storageKey: string;
    width: number;
    height: number;
    overlayText: string;
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
  const detailUrl = username ? `/${username}/status/${image.id}` : imageUrl;

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={image.overlayText}
          className="w-full h-auto aspect-square object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 pointer-events-none">
          <p className="text-white text-sm line-clamp-2">{image.overlayText}</p>
        </div>
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
