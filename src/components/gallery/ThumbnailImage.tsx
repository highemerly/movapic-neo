"use client";

import { useEffect, useRef, useState } from "react";

interface ThumbnailImageProps {
  src: string;
  alt: string;
  position?: string;
  className?: string;
  loading?: "lazy" | "eager";
  /**
   * トリミングなし表示。親要素のサイズ（画像と同じアスペクト比の枠）に
   * そのまま収める。aspect-square・拡大・位置クロップを行わない。
   */
  fill?: boolean;
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
  fill = false,
}: ThumbnailImageProps) {
  // 読み込み完了まではシマー（パルス）プレースホルダーで隠し、完了したらフェードイン。
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // キャッシュ済み等で onLoad 前に読み込み完了しているケースを拾う
    if (ref.current?.complete) setLoaded(true);
  }, []);

  // fill: 親の枠（画像と同比率）にそのまま収める＝実質トリミングなし。
  // 既定: 正方形にクロップ（拡大＋文字位置基準）。
  const containerClass = fill
    ? "relative h-full w-full overflow-hidden"
    : "relative aspect-square w-full overflow-hidden";
  const imgClass = fill
    ? "absolute inset-0 h-full w-full object-cover"
    : `absolute inset-0 h-full w-full scale-[1.15] object-cover ${getPositionClasses(position)}`;

  return (
    <div className={containerClass}>
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
        className={`${imgClass} transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${className}`}
        loading={loading}
      />
    </div>
  );
}
