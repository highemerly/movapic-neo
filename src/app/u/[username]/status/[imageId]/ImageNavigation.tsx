import Link from "next/link";

interface ImageNavigationProps {
  username: string;
  prevImage: { id: string; overlayText: string } | null;
  nextImage: { id: string; overlayText: string } | null;
}

// テキストを指定文字数で切り詰める
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "…";
}

export function ImageNavigation({
  username,
  prevImage,
  nextImage,
}: ImageNavigationProps) {
  // 両方ない場合は何も表示しない
  if (!prevImage && !nextImage) {
    return null;
  }

  return (
    <nav className="flex justify-between items-center gap-4 py-4 border-t">
      {/* 前の画像（古い方向） */}
      <div className="flex-1 min-w-0">
        {prevImage ? (
          <Link
            href={`/u/${username}/status/${prevImage.id}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span className="shrink-0">←</span>
            <span className="truncate group-hover:underline">
              {truncateText(prevImage.overlayText, 20)}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </div>

      {/* 次の画像（新しい方向） */}
      <div className="flex-1 min-w-0 text-right">
        {nextImage ? (
          <Link
            href={`/u/${username}/status/${nextImage.id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span className="truncate group-hover:underline">
              {truncateText(nextImage.overlayText, 20)}
            </span>
            <span className="shrink-0">→</span>
          </Link>
        ) : (
          <span />
        )}
      </div>
    </nav>
  );
}
