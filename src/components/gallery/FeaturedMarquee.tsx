"use client";

import { useEffect, useRef } from "react";
import Link from "@/components/Link";
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

// ロゴ直下に表示する作例の作品スクロール。
// 横スクロールコンテナ（overflow-x: auto）を JS で自動送りし、
// ユーザーがホイール/タッチ/ドラッグで手動スクロールしている間は自動送りを止め、
// 操作が止まったら再開する。シームレスにループさせるため画像配列を2回描画し、
// 1セット分（scrollWidth の半分）を境にスクロール位置を巻き戻す。
export function FeaturedMarquee({ images, publicUrl }: FeaturedMarqueeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || images.length === 0) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = prefersReduced ? 12 : 70; // 自動送りの速度（px/秒）

    // 2セット描画しているので、1セット分の幅を境にループさせる。
    const half = () => el.scrollWidth / 2;

    let raf = 0;
    let last = 0;
    let paused = false;
    let resumeTimer = 0;

    // scrollLeft を [0, half) に正規化してシームレスにループ（左右どちらの手動スクロールにも対応）。
    const normalize = () => {
      const h = half();
      if (h <= 0) return;
      if (el.scrollLeft >= h) el.scrollLeft -= h;
      else if (el.scrollLeft <= 0) el.scrollLeft = h;
    };

    const step = (now: number) => {
      if (last === 0) last = now;
      const dt = (now - last) / 1000;
      last = now;
      if (!paused) {
        el.scrollLeft += speed * dt;
        normalize();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const pause = () => {
      paused = true;
      window.clearTimeout(resumeTimer);
    };
    const scheduleResume = () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        paused = false;
        last = 0; // 再開時に dt が跳ねないようリセット
      }, 1500);
    };

    const onUserScroll = () => normalize();
    const onPointerEnter = () => pause();
    const onPointerLeave = () => scheduleResume();
    const onPointerDown = () => pause();
    const onPointerUp = () => scheduleResume();
    const onWheel = () => {
      pause();
      scheduleResume();
    };
    const onTouchStart = () => pause();
    const onTouchEnd = () => scheduleResume();

    el.addEventListener("scroll", onUserScroll, { passive: true });
    el.addEventListener("pointerenter", onPointerEnter);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resumeTimer);
      el.removeEventListener("scroll", onUserScroll);
      el.removeEventListener("pointerenter", onPointerEnter);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [images.length]);

  if (images.length === 0) return null;

  const loop = [...images, ...images];

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar w-full overflow-x-auto overflow-y-hidden py-2"
      aria-label="みんなの作品の作例"
    >
      <div className="flex w-max gap-2">
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
