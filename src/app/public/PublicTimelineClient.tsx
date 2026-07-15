"use client";

import { useMemo } from "react";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import {
  TimelineImageCard,
  type TimelineCardImage,
} from "@/components/gallery/TimelineImageCard";
import { useInfiniteImages } from "@/hooks/useInfiniteImages";
import { useTimelinePersistence } from "@/hooks/useTimelinePersistence";
import { PullToRefresh } from "@/components/gallery/PullToRefresh";

type TimelineImage = TimelineCardImage;

interface PublicTimelineClientProps {
  initialImages: TimelineImage[];
  publicUrl: string;
  /** サーバー絞り込みパラメータ（カンマ区切り）。未指定なら null */
  instancesParam: string | null;
  /**
   * ミュート中の投稿者キー（`username@domain`）。クライアント側でこの投稿者の
   * 画像を一覧から除外する（API は全員共通データを返し、除外は表示側で行う）。
   */
  mutedAuthorKeys?: string[];
}

export function PublicTimelineClient({
  initialImages,
  publicUrl,
  instancesParam,
  mutedAuthorKeys,
}: PublicTimelineClientProps) {
  const mutedSet = useMemo(() => new Set(mutedAuthorKeys ?? []), [mutedAuthorKeys]);
  // サーバー絞り込み単位でスクロール位置・一覧を永続化する（ハードリロードで復元）。
  const { restore, onChange } = useTimelinePersistence<TimelineImage>(
    `tl:public:${instancesParam ?? "all"}`
  );
  const { images, isLoading, nextCursor, loaderRef, newIds, refresh } = useInfiniteImages<TimelineImage>({
    initialImages,
    // カーソルは生の initialImages 基準（フィルタ前）で決める。除外で表示が減っても
    // ページングは壊れない（loaderRef が見え続ければ次ページを自動取得して埋める）。
    initialCursor:
      initialImages.length >= 20
        ? initialImages[initialImages.length - 1]?.id ?? null
        : null,
    filterItem:
      mutedSet.size > 0
        ? (img) => !mutedSet.has(`${img.user.username}@${img.user.instance}`)
        : undefined,
    restore,
    onChange,
    fetchPage: async (cursor) => {
      const params = new URLSearchParams({ cursor, limit: "20" });
      if (instancesParam) params.set("instances", instancesParam);
      const response = await fetch(`/api/v1/public/timeline?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load more");
      return response.json();
    },
    // 再前面化／bfcache 復元／永続化復元時に最新ページを取り直し、head を作り直す
    // （reconcile）。新着は先頭へ足して「にゅるっと追加」、削除・非公開・編集も反映される。
    fetchFirstPage: async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (instancesParam) params.set("instances", instancesParam);
      const response = await fetch(`/api/v1/public/timeline?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to refresh");
      return response.json();
    },
  });

  return (
    <>
      <PullToRefresh onRefresh={refresh} />
      <GalleryGrid
        images={images}
        getKey={(image) => image.id}
        aspect={(image) => image.width / image.height}
        emptyMessage="まだ画像が投稿されていません"
        endMessage="すべての画像を表示しました"
        isLoading={isLoading}
        nextCursor={nextCursor}
        loaderRef={loaderRef}
        newIds={newIds}
        renderItem={(image, fill) => (
          <TimelineImageCard
            image={image}
            publicUrl={publicUrl}
            fill={fill}
            // 「同じサーバー」タブ（instances 絞り込みあり）は from に状態として載せ、
            // 画像詳細の戻る導線でタブ・絞り込みを復元する（"public:<instances>"）。
            from={instancesParam ? `public:${instancesParam}` : "public"}
          />
        )}
      />
    </>
  );
}
