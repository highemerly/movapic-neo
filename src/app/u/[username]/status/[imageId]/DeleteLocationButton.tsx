"use client";

import { X } from "lucide-react";
import { useDeleteLocation } from "./useDeleteLocation";

interface DeleteLocationButtonProps {
  imageId: string;
  /** 確認モーダルで「〜を削除します」と提示するための表示名（例: 千葉県流山市） */
  locationLabel: string;
}

export function DeleteLocationButton({ imageId, locationLabel }: DeleteLocationButtonProps) {
  const { deleting, remove } = useDeleteLocation(imageId, locationLabel);

  return (
    <button
      onClick={remove}
      disabled={deleting}
      className="relative inline-flex items-center rounded p-1 text-muted-foreground transition-colors hover:text-red-600 disabled:opacity-50 before:absolute before:-inset-y-[11px] before:-left-1 before:-right-3 before:content-['']"
      title="撮影場所を削除"
      aria-label="撮影場所を削除"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
