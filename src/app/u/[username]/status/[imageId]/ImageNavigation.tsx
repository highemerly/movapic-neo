import Link from "next/link";

interface NavImage {
  id: string;
  overlayText: string;
  thumbnailKey: string | null;
  storageKey: string;
  user: {
    username: string;
  };
}

interface ImageNavigationProps {
  prevImage: NavImage | null;
  nextImage: NavImage | null;
  from?: "public";
  publicUrl: string;
}

// サムネイルURLを取得（サムネイルがなければフルサイズ画像にフォールバック）
function getThumbnailUrl(
  image: NavImage,
  publicUrl: string
): string {
  const key = image.thumbnailKey || image.storageKey;
  return `${publicUrl}/${key}`;
}

export function ImageNavigation({
  prevImage,
  nextImage,
  from,
  publicUrl,
}: ImageNavigationProps) {
  const queryString = from ? `?from=${from}` : "";
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
            href={`/u/${prevImage.user.username}/status/${prevImage.id}${queryString}`}
            className="flex flex-col items-start gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0">←</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getThumbnailUrl(prevImage, publicUrl)}
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
            href={`/u/${nextImage.user.username}/status/${nextImage.id}${queryString}`}
            className="flex flex-col items-end gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getThumbnailUrl(nextImage, publicUrl)}
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
