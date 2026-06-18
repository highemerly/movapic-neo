"use client";

import { useState } from "react";
import Link from "@/components/Link";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { ThumbnailImage } from "./ThumbnailImage";
import { FavoriteOverlay } from "@/components/favorite/FavoriteOverlay";
import { PinOverlay } from "@/components/pin/PinOverlay";

interface ImageCardProps {
  image: {
    id: string;
    storageKey: string;
    width: number;
    height: number;
    overlayText: string;
    position: string;
    favoriteCount?: number;
    createdAt: string;
  };
  publicUrl: string;
  username?: string;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
  isPinned?: boolean;
  /** トリミングなし表示（Justified レイアウト用）。親要素のサイズに収める */
  fill?: boolean;
  /** 画像ページへ付与する from クエリ（例: "user-map"）。未指定なら付けない */
  from?: string;
}

export function ImageCard({ image, publicUrl, username, showDelete, onDelete, isPinned, fill, from }: ImageCardProps) {
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);
  const imageUrl = `${publicUrl}/${image.storageKey}`;
  const base = username ? `/u/${username}/status/${image.id}` : imageUrl;
  const detailUrl = username && from ? `${base}?from=${from}` : base;

  const handleDelete = async () => {
    if (!onDelete) return;
    if (
      !(await confirm({
        title: "画像を削除",
        description: "この画像を削除しますか？",
        confirmText: "削除する",
        destructive: true,
      }))
    )
      return;

    setIsDeleting(true);
    try {
      await onDelete(image.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`group relative bg-muted rounded-lg overflow-hidden ${fill ? "h-full w-full" : ""}`}>
      <Link href={detailUrl} target={username ? undefined : "_blank"} rel={username ? undefined : "noopener noreferrer"} className={fill ? "block h-full w-full" : "block"}>
        <ThumbnailImage
          src={imageUrl}
          alt={image.overlayText}
          position={image.position}
          fill={fill}
          className="group-hover:opacity-90 transition-opacity"
        />
      </Link>
      {showDelete && onDelete && (
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="absolute top-2 right-2 bg-destructive text-white hover:bg-destructive/90 rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          aria-label="削除"
        >
          {isDeleting ? "..." : "×"}
        </button>
      )}
      {/* ピン留めオーバーレイ */}
      <PinOverlay isPinned={!!isPinned} />
      {/* お気に入り数オーバーレイ */}
      {image.favoriteCount !== undefined && (
        <FavoriteOverlay count={image.favoriteCount} />
      )}
    </div>
  );
}
