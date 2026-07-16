"use client";

import { ImagePlus } from "lucide-react";
import Link from "@/components/Link";
import { Button } from "@/components/ui/button";
import { ImageCard } from "@/components/gallery/ImageCard";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { useInfiniteImages } from "@/hooks/useInfiniteImages";
import { useTimelinePersistence } from "@/hooks/useTimelinePersistence";
import { useRegisterPullToRefresh } from "@/components/PullToRefresh";
import { NewItemsPill } from "@/components/gallery/NewItemsPill";
import { RefreshResultPill } from "@/components/gallery/RefreshResultPill";

interface GalleryImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  altText?: string | null;
  position: string;
  size: string;
  blurDataUrl?: string | null;
  favoriteCount: number;
  pinnedAt: string | null;
  createdAt: string;
}

interface UserGalleryClientProps {
  initialImages: GalleryImage[];
  publicUrl: string;
  username: string;
  /** 閲覧者がこのページのオーナー本人か（空状態のCTA表示に使用） */
  isOwner?: boolean;
}

export function UserGalleryClient({
  initialImages,
  publicUrl,
  username,
  isOwner = false,
}: UserGalleryClientProps) {
  // ユーザー単位でスクロール位置・一覧を永続化する（ハードリロードで復元）。
  const { restore, onChange } = useTimelinePersistence<GalleryImage>(
    `tl:user:${username}`
  );
  const { images, isLoading, nextCursor, loaderRef, newIds, newCount, clearNewCount, refreshResult, refresh } = useInfiniteImages<GalleryImage>({
    initialImages,
    initialCursor:
      initialImages.length >= 20
        ? initialImages[initialImages.length - 1]?.id ?? null
        : null,
    dedupe: true,
    restore,
    onChange,
    fetchPage: async (cursor) => {
      const response = await fetch(
        `/api/v1/public/users/${username}/images?cursor=${cursor}&limit=20`
      );
      if (!response.ok) throw new Error("Failed to load more");
      return response.json();
    },
    // 再前面化／bfcache 復元・永続化復元時に最新ページを取り直し、head を作り直す
    // （reconcile）。新着追加・削除・非公開・編集を反映しつつ tail/スクロールは保つ。
    fetchFirstPage: async () => {
      const response = await fetch(
        `/api/v1/public/users/${username}/images?limit=20`
      );
      if (!response.ok) throw new Error("Failed to refresh");
      return response.json();
    },
  });

  // standalone の pull-to-refresh をこの一覧の in-place 更新に紐づける。
  useRegisterPullToRefresh(refresh);

  return (
    <>
      <NewItemsPill
        count={newCount}
        onTap={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          clearNewCount();
        }}
      />
      <RefreshResultPill result={refreshResult} />
      <GalleryGrid
        images={images}
        getKey={(image) => image.id}
        aspect={(image) => image.width / image.height}
        emptyMessage="まだ画像がありません"
        emptyAction={
          isOwner ? (
            <Link href="/create" className="inline-block">
              <Button
                size="lg"
                className="h-12 px-8 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <ImagePlus className="mr-2 h-5 w-5" />
                写真を投稿する
              </Button>
            </Link>
          ) : undefined
        }
        endMessage="すべての画像を表示しました"
        isLoading={isLoading}
        nextCursor={nextCursor}
        loaderRef={loaderRef}
        newIds={newIds}
        renderItem={(image, fill) => (
          <ImageCard
            image={image}
            publicUrl={publicUrl}
            username={username}
            isPinned={!!image.pinnedAt}
            fill={fill}
          />
        )}
      />
    </>
  );
}
