"use client";

import Link from "@/components/Link";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";
import { RetryImg } from "@/components/RetryImg";
import { FavoriteOverlay } from "@/components/favorite/FavoriteOverlay";
import { userPathSegment } from "@/lib/userHandle";
import { useHomeServer } from "@/components/HomeServerProvider";

export interface TimelineCardImage {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  overlayText: string;
  /** 画像の代替テキスト（ALT）。未設定時は overlayText を alt にフォールバック。 */
  altText?: string | null;
  position: string;
  size: string;
  blurDataUrl?: string | null;
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
 * - grid（正方形タイル, fill=false）: アバターを右下隅に小さく置く（名前・お気に入り数なし）。
 *   右下は横書き文字の最初の文字とかぶらないため。
 * - packed（masonry, fill=true）: 従来どおりグラデ帯＋アバター＋名前＋お気に入り数を表示。
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
  const homeServer = useHomeServer();
  const imageUrl = `${publicUrl}/${image.storageKey}`;
  const base = `/u/${userPathSegment(image.user.username, image.user.instance, homeServer)}/status/${image.id}`;
  // from は "public:<instances>" のように状態を含みうるのでエンコードする（ImageNavigation と同様）。
  const detailUrl = from ? `${base}?from=${encodeURIComponent(from)}` : base;

  return (
    <Link
      href={detailUrl}
      className={`relative rounded-lg overflow-hidden group ${fill ? "block h-full w-full" : "block"}`}
    >
      <ThumbnailImage
        src={imageUrl}
        alt={image.altText || image.overlayText}
        position={image.position}
        size={image.size}
        fill={fill}
        blurDataUrl={image.blurDataUrl}
        className="group-hover:opacity-90 transition-opacity"
      />
      {fill ? (
        // packed（masonry）: 従来どおりグラデ帯＋アバター＋名前＋お気に入り数
        <>
          <div
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4 flex items-center gap-1.5 ${
              image.favoriteCount > 0 ? "pr-12" : ""
            }`}
          >
            {image.user.avatarUrl && (
              <RetryImg
                src={image.user.avatarUrl}
                alt={image.user.displayName || image.user.username}
                className="w-5 h-5 rounded-full"
              />
            )}
            <span className="text-xs text-white truncate min-w-0">
              {image.user.displayName || image.user.username}
            </span>
          </div>
          {/* お気に入り数オーバーレイ */}
          <FavoriteOverlay count={image.favoriteCount} />
        </>
      ) : (
        // grid（正方形タイル）: アバターを右下隅に小さく（名前・お気に入り数なし）
        image.user.avatarUrl && (
          <RetryImg
            src={image.user.avatarUrl}
            alt={image.user.displayName || image.user.username}
            className="absolute bottom-0.5 right-0.5 w-[22px] h-[22px] rounded-full opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          />
        )
      )}
    </Link>
  );
}
