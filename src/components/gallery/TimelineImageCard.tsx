"use client";

import Link from "@/components/Link";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";
import { FavoriteOverlay } from "@/components/favorite/FavoriteOverlay";
import { userPathSegment } from "@/lib/userHandle";

export interface TimelineCardImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  position: string;
  favoriteCount: number;
  createdAt: string;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    instance: string;
  };
}

/**
 * 投稿者オーバーレイ付きの画像カード（公開タイムライン / お気に入り一覧で共通）。
 * 投稿者のアバター＋名前のグラデーションとお気に入り数オーバーレイを表示する。
 */
export function TimelineImageCard({
  image,
  publicUrl,
  fill,
  from,
}: {
  image: TimelineCardImage;
  publicUrl: string;
  fill?: boolean;
  /** 画像ページへ付与する from クエリ（例: "public"）。未指定なら付けない */
  from?: string;
}) {
  const imageUrl = `${publicUrl}/${image.storageKey}`;
  const base = `/u/${userPathSegment(image.user.username, image.user.instance)}/status/${image.id}`;
  const detailUrl = from ? `${base}?from=${from}` : base;

  return (
    <Link
      href={detailUrl}
      className={`relative rounded-lg overflow-hidden group ${fill ? "block h-full w-full" : "block"}`}
    >
      <ThumbnailImage
        src={imageUrl}
        alt={image.overlayText}
        position={image.position}
        fill={fill}
        className="group-hover:opacity-90 transition-opacity"
      />
      {/* 投稿者オーバーレイ（お気に入り数がある時は右側に余白を確保して名前と重ならないようにする） */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4 flex items-center gap-1.5 ${
          image.favoriteCount > 0 ? "pr-12" : ""
        }`}
      >
        {image.user.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.user.avatarUrl ?? undefined}
            alt={image.user.displayName || image.user.username}
            className="w-5 h-5 rounded-full"
            loading="lazy"
          />
        )}
        <span className="text-xs text-white truncate min-w-0">
          {image.user.displayName || image.user.username}
        </span>
      </div>
      {/* お気に入り数オーバーレイ */}
      <FavoriteOverlay count={image.favoriteCount} />
    </Link>
  );
}
