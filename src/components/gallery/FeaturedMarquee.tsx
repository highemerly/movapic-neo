"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";

export interface FeaturedMarqueeItem {
  id: string;
  storageKey: string;
  overlayText: string;
  position: string;
  username: string;
}

interface FeaturedMarqueeProps {
  images: FeaturedMarqueeItem[];
  publicUrl: string;
}

// ロゴ直下に表示する作例の自動スクロール（マーキー）。
// 1画面に4枚程度が並び、横方向に連続スクロールしてたくさんの作例が流れる。
// シームレスにループさせるため画像配列を2回描画し、track 全体を -50% 平行移動する。
export function FeaturedMarquee({ images, publicUrl }: FeaturedMarqueeProps) {
  if (images.length === 0) return null;

  // 枚数に応じて1周の所要時間を調整（1枚あたり約4秒）。最低でも程よい速度を確保。
  const durationSec = Math.max(images.length * 4, 24);
  const loop = [...images, ...images];

  return (
    <div
      className="group relative w-full overflow-hidden py-2"
      aria-label="みんなの作品の作例"
    >
      <div
        className="flex w-max gap-2 animate-marquee group-hover:[animation-play-state:paused]"
        style={{ ["--marquee-duration"]: `${durationSec}s` } as CSSProperties}
      >
        {loop.map((image, i) => (
          <Link
            key={`${image.id}-${i}`}
            href={`/u/${image.username}/status/${image.id}`}
            aria-hidden={i >= images.length}
            tabIndex={i >= images.length ? -1 : undefined}
            className="block w-[calc(50vw-8px)] max-w-[320px] shrink-0 overflow-hidden rounded-lg bg-muted"
          >
            <ThumbnailImage
              src={`${publicUrl}/${image.storageKey}`}
              alt={image.overlayText}
              position={image.position}
              loading="eager"
              className="hover:opacity-90 transition-opacity"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
