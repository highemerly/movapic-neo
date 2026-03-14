"use client";

interface DayData {
  count: number;
  latest: {
    id: string;
    thumbnailKey: string | null;
    storageKey: string;
    position: string;
  };
}

interface DayCellProps {
  day: number | null;
  dayData?: DayData;
  publicUrl: string;
  isToday: boolean;
  isSunday: boolean;
  isSaturday: boolean;
  loading: boolean;
  onClick: () => void;
}

export function DayCell({
  day,
  dayData,
  publicUrl,
  isToday,
  isSunday,
  isSaturday,
  loading,
  onClick,
}: DayCellProps) {
  if (day === null) {
    return <div className="aspect-square bg-muted/30 rounded" />;
  }

  const hasImage = !!dayData;
  const imageUrl = dayData?.latest.thumbnailKey
    ? `${publicUrl}/${dayData.latest.thumbnailKey}`
    : dayData?.latest.storageKey
    ? `${publicUrl}/${dayData.latest.storageKey}`
    : null;

  return (
    <button
      onClick={onClick}
      disabled={!hasImage || loading}
      className={`
        relative aspect-square rounded overflow-hidden
        transition-all duration-200
        ${hasImage ? "cursor-pointer hover:ring-2 hover:ring-primary" : "cursor-default"}
        ${isToday ? "ring-2 ring-primary ring-offset-2" : ""}
        ${loading ? "animate-pulse" : ""}
      `}
    >
      {/* 背景画像またはプレースホルダー */}
      {hasImage && imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${day}日の投稿`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          {/* オーバーレイ */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-muted/50" />
      )}

      {/* 日付 */}
      <div
        className={`
          absolute bottom-0.5 left-1/2 -translate-x-1/2
          text-xs sm:text-sm font-medium
          ${hasImage ? "text-white drop-shadow-md" : ""}
          ${!hasImage && isSunday ? "text-red-500" : ""}
          ${!hasImage && isSaturday ? "text-blue-500" : ""}
          ${!hasImage && !isSunday && !isSaturday ? "text-muted-foreground" : ""}
        `}
      >
        {day}
      </div>
    </button>
  );
}
