"use client";

import { type ReactNode, type RefObject } from "react";
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
  /** 画像が0件のときに文言の下へ表示するCTA（任意） */
  emptyAction?: ReactNode;
  /** 末尾（これ以上ない）で表示する文言 */
  endMessage: string;
  isLoading: boolean;
  nextCursor: string | null;
  loaderRef: RefObject<HTMLDivElement | null>;
  /** 差分更新で先頭に prepend された id 群。入場アニメ（にゅるっと追加）を当てる。 */
  newIds?: ReadonlySet<string>;
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
  emptyAction,
  endMessage,
  isLoading,
  nextCursor,
  loaderRef,
  newIds,
}: GalleryGridProps<T>) {
  const [layout] = useGalleryLayout();

  if (images.length === 0) {
    return <EmptyState message={emptyMessage} action={emptyAction} />;
  }

  // 差分更新で prepend された要素にだけ入場アニメ用クラスを付ける。
  const enterClass = (item: T) =>
    newIds?.has(getKey(item)) ? "tl-enter" : undefined;

  return (
    <div className="relative">
      <GalleryLayoutToggle />
      {layout === "packed" ? (
        <MasonryGrid
          items={images}
          aspect={aspect}
          getKey={getKey}
          renderItem={(image) => renderItem(image, true)}
          itemClassName={enterClass}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
          {images.map((image) => (
            <div key={getKey(image)} className={enterClass(image)}>
              {renderItem(image, false)}
            </div>
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
