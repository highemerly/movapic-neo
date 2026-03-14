"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageData {
  id: string;
  storageKey: string;
  thumbnailKey: string | null;
  position: string;
  overlayText: string;
  createdAt: string;
}

interface DayDetailModalProps {
  username: string;
  year: number;
  month: number;
  day: number;
  publicUrl: string;
  onClose: () => void;
}

export function DayDetailModal({
  username,
  year,
  month,
  day,
  publicUrl,
  onClose,
}: DayDetailModalProps) {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDayImages = useCallback(async () => {
    setLoading(true);
    try {
      // 日付範囲を計算（JST）
      const startDate = new Date(year, month - 1, day);
      const endDate = new Date(year, month - 1, day + 1);

      // APIを呼び出してその日の画像を取得
      const response = await fetch(
        `/api/v1/public/users/${username}/images?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      if (response.ok) {
        const json = await response.json();
        setImages(json.images || []);
      }
    } catch (error) {
      console.error("Failed to fetch day images:", error);
    } finally {
      setLoading(false);
    }
  }, [username, year, month, day]);

  useEffect(() => {
    fetchDayImages();
  }, [fetchDayImages]);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 背景クリックでモーダルを閉じる
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-background rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-bold">
            {year}年{month}月{day}日の投稿
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* コンテンツ */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-muted animate-pulse rounded"
                />
              ))}
            </div>
          ) : images.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              この日の投稿はありません
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((image) => {
                const imageUrl = image.thumbnailKey
                  ? `${publicUrl}/${image.thumbnailKey}`
                  : `${publicUrl}/${image.storageKey}`;

                return (
                  <Link
                    key={image.id}
                    href={`/u/${username}/status/${image.id}`}
                    className="relative aspect-square rounded overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={image.overlayText}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
