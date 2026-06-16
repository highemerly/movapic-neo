"use client";

import { useEffect, useRef, useState } from "react";

interface ThumbnailImageProps {
  src: string;
  alt: string;
  position?: string;
  className?: string;
  loading?: "lazy" | "eager";
}

// 文字位置に応じたobject-positionとtransform-originを返す
// 文字が配置されている角を基準に拡大表示
function getPositionClasses(position: string): string {
  switch (position) {
    case "top":
      return "object-left-top origin-top-left";
    case "bottom":
      return "object-left-bottom origin-bottom-left";
    case "left":
      return "object-left-top origin-top-left";
    case "right":
      return "object-right-top origin-top-right";
    default:
      return "object-center origin-center";
  }
}

export function ThumbnailImage({
  src,
  alt,
  position = "top",
  className = "",
  loading = "lazy",
}: ThumbnailImageProps) {
  // 読み込み完了まではシマー（パルス）プレースホルダーで隠し、完了したらフェードイン。
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // キャッシュ済み等で onLoad 前に読み込み完了しているケースを拾う
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    <div className="relative aspect-square w-full overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full scale-[1.15] object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${getPositionClasses(position)} ${className}`}
        loading={loading}
      />
    </div>
  );
}
