"use client";

import { Fragment, type ReactNode, type RefObject } from "react";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { GalleryLayoutToggle } from "@/components/gallery/GalleryLayoutToggle";
import { useGalleryLayout } from "@/hooks/useGalleryLayout";
import { EmptyState } from "@/components/ui/empty-state";

interface GalleryGridProps<T> {
  images: T[];
  getKey: (item: T) => string;
  /** 画像のアスペクト比（width / height）。packed レイアウトで使用 */
  aspect: (item: T) => number;
  /** カード描画。fill=true は packed（親サイズに収める）レイアウト用 */
  renderItem: (item: T, fill: boolean) => ReactNode;
  /** 画像が0件のときに表示する文言 */
  emptyMessage: string;
  /** 末尾（これ以上ない）で表示する文言 */
  endMessage: string;
  isLoading: boolean;
  nextCursor: string | null;
  loaderRef: RefObject<HTMLDivElement | null>;
}

/**
 * ギャラリー一覧の共通レイアウト。
 * レイアウト切替（packed=Masonry / grid）、空状態、無限スクロール用ローダーを内包する。
 * カードの見た目だけ renderItem で差し替える。
 */
export function GalleryGrid<T>({
  images,
  getKey,
  aspect,
  renderItem,
  emptyMessage,
  endMessage,
  isLoading,
  nextCursor,
  loaderRef,
}: GalleryGridProps<T>) {
  const [layout] = useGalleryLayout();

  if (images.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="relative">
      <GalleryLayoutToggle />
      {layout === "packed" ? (
        <MasonryGrid
          items={images}
          aspect={aspect}
          getKey={getKey}
          renderItem={(image) => renderItem(image, true)}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
          {images.map((image) => (
            <Fragment key={getKey(image)}>{renderItem(image, false)}</Fragment>
          ))}
        </div>
      )}

      {/* 無限スクロール用のローダー */}
      <div ref={loaderRef} className="mt-8 text-center py-4">
        {isLoading && (
          <span className="text-muted-foreground">読み込み中...</span>
        )}
        {!nextCursor && images.length > 0 && (
          <span className="text-muted-foreground text-sm">{endMessage}</span>
        )}
      </div>
    </div>
  );
}
