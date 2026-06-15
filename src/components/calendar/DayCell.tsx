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

/** 後日のダブル投稿で、この空き日が埋まったときの情報。 */
interface FilledMakeup {
  /** 穴を埋めた（ダブル投稿した）日(1-31)。 */
  filledBy: number;
  /** filledBy 日に2枚目に投稿した写真（サムネ＋リンク先）。 */
  image: { id: string; thumbnailKey: string | null; storageKey: string };
}

interface DayCellProps {
  day: number | null;
  dayData?: DayData;
  /** 投稿のない空き日が、後日のダブル投稿で穴埋めされた場合の情報。 */
  filledMakeup?: FilledMakeup;
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
  filledMakeup,
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
  const isFilledHole = !hasImage && !!filledMakeup;
  // 2枚以上投稿した日 = 皆勤賞の穴埋め元。金色の縁取りと枚数バッジで示す。
  const makeupCount = (dayData?.count ?? 0) >= 2 ? dayData!.count : 0;
  const imageUrl = dayData?.latest.thumbnailKey
    ? `${publicUrl}/${dayData.latest.thumbnailKey}`
    : dayData?.latest.storageKey
    ? `${publicUrl}/${dayData.latest.storageKey}`
    : null;
  // 穴埋め済みセルは「埋めた日の2枚目の写真」をサムネに使う。
  const filledImageUrl = filledMakeup
    ? filledMakeup.image.thumbnailKey
      ? `${publicUrl}/${filledMakeup.image.thumbnailKey}`
      : `${publicUrl}/${filledMakeup.image.storageKey}`
    : null;
  const clickable = hasImage || isFilledHole;

  return (
    <button
      onClick={onClick}
      disabled={!clickable || loading}
      title={isFilledHole ? `${filledMakeup!.filledBy}日のダブル投稿で穴埋めされました` : undefined}
      className={`
        relative aspect-square rounded overflow-hidden
        transition-all duration-200
        ${clickable ? "cursor-pointer hover:ring-2 hover:ring-primary" : "cursor-default"}
        ${isToday ? "ring-2 ring-primary ring-offset-2" : ""}
        ${loading ? "animate-pulse" : ""}
      `}
    >
      {/* 背景画像またはプレースホルダー（穴埋め済みは2枚目サムネ＋緑オーバーレイ） */}
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
      ) : isFilledHole && filledImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={filledImageUrl}
            alt={`${day}日の穴埋め（${filledMakeup!.filledBy}日の投稿）`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          {/* 穴埋めを示す緑の塗りつぶし（透明度高め） */}
          <div className="absolute inset-0 bg-green-500/55 dark:bg-green-500/45" />
        </>
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

      {/* 穴埋め済み（空き日が後日のダブル投稿で埋まった）: 緑の内側リング＋「何日で埋めたか」 */}
      {isFilledHole && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded ring-2 ring-inset ring-green-500/90" />
          <span className="absolute right-0.5 top-0.5 z-10 rounded-full bg-green-600 px-1 text-[9px] font-bold leading-tight text-white shadow-sm">
            {filledMakeup!.filledBy}日
          </span>
        </>
      )}

      {/* 日付 */}
      <div
        className={`
          absolute bottom-0.5 left-1/2 -translate-x-1/2
          text-xs sm:text-sm font-medium
          ${hasImage ? "text-white drop-shadow-md" : ""}
          ${isFilledHole ? "text-white drop-shadow-md" : ""}
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
