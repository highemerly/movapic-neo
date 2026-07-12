"use client";

import { useRef } from "react";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { ImageCard } from "@/components/gallery/ImageCard";

export type PrefectureImage = {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  altText?: string | null;
  position: string;
  size: string;
  favoriteCount?: number;
  createdAt: string;
};

interface PrefectureImageGridProps {
  images: PrefectureImage[];
  publicUrl: string;
  username: string;
  selectedPrefecture: string;
}

/**
 * 地図（都道府県別）一覧を、タイムライン／お気に入り／ユーザー写真一覧と同じ
 * GalleryGrid で描画するためのラッパー。これにより閲覧者のレイアウト設定
 * （タイル／積み上げ・localStorage 共有）が地図一覧にも効くようになる。
 *
 * 都道府県別は最大60件を一括表示しページングしないため、GalleryGrid が要求する
 * 無限スクロール系の props には静的値（nextCursor=null, isLoading=false）を渡す。
 */
export function PrefectureImageGrid({
  images,
  publicUrl,
  username,
  selectedPrefecture,
}: PrefectureImageGridProps) {
  // ページングしないので実際には監視されないが、GalleryGrid の型を満たすため用意する。
  const loaderRef = useRef<HTMLDivElement | null>(null);

  return (
    <GalleryGrid
      images={images}
      getKey={(img) => img.id}
      aspect={(img) => img.width / img.height}
      emptyMessage="該当する画像が見つかりませんでした。"
      endMessage=""
      isLoading={false}
      nextCursor={null}
      loaderRef={loaderRef}
      renderItem={(img, fill) => (
        <ImageCard
          image={img}
          publicUrl={publicUrl}
          username={username}
          from={`user-map:${selectedPrefecture}`}
          fill={fill}
        />
      )}
    />
  );
}
