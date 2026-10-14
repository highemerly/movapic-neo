import Link from "@/components/Link";
import { navImageHref, navImageThumbnailUrl, type NavImage } from "./navImage";

interface ImageNavigationProps {
  prevImage: NavImage | null;
  nextImage: NavImage | null;
  from?: string;
  publicUrl: string;
}

export function ImageNavigation({
  prevImage,
  nextImage,
  from,
  publicUrl,
}: ImageNavigationProps) {
  // from は "user-map:東京都" のように状態（都道府県名）を含みうるので必ずエンコードする。
  const queryString = from ? `?from=${encodeURIComponent(from)}` : "";
  // 両方ない場合は何も表示しない
  if (!prevImage && !nextImage) {
    return null;
  }

  return (
    <nav className="flex justify-between gap-4 py-4 border-t">
      {/* 前の画像（古い方向） */}
      <div className="flex-1 min-w-0">
        {prevImage ? (
          <Link
            href={navImageHref(prevImage, queryString)}
            className="flex flex-col items-start gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0">←</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={navImageThumbnailUrl(prevImage, publicUrl)}
                alt=""
                className="w-8 h-8 rounded object-cover shrink-0"
              />
            </div>
            <span className="truncate w-full group-hover:underline">
              {prevImage.overlayText}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </div>

      {/* 次の画像（新しい方向） */}
      <div className="flex-1 min-w-0">
        {nextImage ? (
          <Link
            href={navImageHref(nextImage, queryString)}
            className="flex flex-col items-end gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={navImageThumbnailUrl(nextImage, publicUrl)}
                alt=""
                className="w-8 h-8 rounded object-cover shrink-0"
              />
              <span className="shrink-0">→</span>
            </div>
            <span className="truncate w-full text-right group-hover:underline">
              {nextImage.overlayText}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </div>
    </nav>
  );
}
