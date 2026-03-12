"use client";

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`w-full h-auto aspect-square object-cover scale-[1.15] ${getPositionClasses(position)} ${className}`}
      loading={loading}
    />
  );
}
