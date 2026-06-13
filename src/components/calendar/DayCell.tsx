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
  /** 投稿のない空き日が、ダブル投稿の穴埋めでカバーされた日かどうか。 */
  isFilledHole?: boolean;
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
  isFilledHole = false,
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
  // 2枚以上投稿した日 = 皆勤賞の穴埋め元。金色の縁取りと枚数バッジで示す。
  const makeupCount = (dayData?.count ?? 0) >= 2 ? dayData!.count : 0;
  const imageUrl = dayData?.latest.thumbnailKey
    ? `${publicUrl}/${dayData.latest.thumbnailKey}`
    : dayData?.latest.storageKey
    ? `${publicUrl}/${dayData.latest.storageKey}`
    : null;

  return (
    <button
      onClick={onClick}
      disabled={!hasImage || loading}
      title={!hasImage && isFilledHole ? "この日はダブル投稿で穴埋めされました" : undefined}
      className={`
        relative aspect-square rounded overflow-hidden
        transition-all duration-200
        ${hasImage ? "cursor-pointer hover:ring-2 hover:ring-primary" : "cursor-default"}
        ${isToday ? "ring-2 ring-primary ring-offset-2" : ""}
        ${loading ? "animate-pulse" : ""}
      `}
    >
      {/* 背景画像またはプレースホルダー（穴埋め済みの空き日は緑） */}
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
      ) : isFilledHole ? (
        <div className="absolute inset-0 bg-green-100 dark:bg-green-950/50" />
      ) : (
        <div className="absolute inset-0 bg-muted/50" />
      )}

      {/* 穴埋め元（2枚以上投稿した日）: 金色の内側リング＋枚数バッジ */}
      {makeupCount > 0 && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded ring-2 ring-inset ring-amber-400/90" />
          <span className="absolute right-0.5 top-0.5 z-10 rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-tight text-amber-950 shadow-sm">
            +{makeupCount - 1}
          </span>
        </>
      )}

      {/* 穴埋め済み（空き日がダブル投稿で埋まった）: 緑の内側リング＋チェック */}
      {!hasImage && isFilledHole && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded ring-2 ring-inset ring-green-500/80" />
          <span className="absolute right-0.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold leading-none text-white shadow-sm">
            ✓
          </span>
        </>
      )}

      {/* 日付 */}
      <div
        className={`
          absolute bottom-0.5 left-1/2 -translate-x-1/2
          text-xs sm:text-sm font-medium
          ${hasImage ? "text-white drop-shadow-md" : ""}
          ${!hasImage && isFilledHole ? "text-green-700 dark:text-green-300" : ""}
          ${!hasImage && !isFilledHole && isSunday ? "text-red-500" : ""}
          ${!hasImage && !isFilledHole && isSaturday ? "text-blue-500" : ""}
          ${!hasImage && !isFilledHole && !isSunday && !isSaturday ? "text-muted-foreground" : ""}
        `}
      >
        {day}
      </div>
    </button>
  );
}
