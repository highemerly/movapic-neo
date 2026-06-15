"use client";

/** 暗いサムネ上で文字を読めるようにする控えめな灰色の縁取り（細めの多方向シャドウ）。 */
const TEXT_OUTLINE =
  "0.5px 0.5px 0 rgba(80,80,80,0.65), -0.5px 0.5px 0 rgba(80,80,80,0.65), 0.5px -0.5px 0 rgba(80,80,80,0.65), -0.5px -0.5px 0 rgba(80,80,80,0.65)";

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
  /** 日本の祝日（振替休日・国民の休日含む）。日曜と同じ赤系で色付けする。 */
  isHoliday: boolean;
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
  isHoliday,
  loading,
  onClick,
}: DayCellProps) {
  if (day === null) {
    return <div className="aspect-square bg-muted/30 rounded" />;
  }

  const hasImage = !!dayData;
  const isFilledHole = !hasImage && !!filledMakeup;
  // サムネ上に日付が重なるセル（縁取り適用の対象）。
  const onImage = hasImage || isFilledHole;
  // 祝日は日曜と同じ赤系。赤を青（土曜）より優先する（祝日が土曜のときも赤にする）。
  const isRed = isSunday || isHoliday;
  const isBlue = isSaturday && !isRed;
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
      title={
        isFilledHole
          ? `${filledMakeup!.filledBy}日のダブル投稿で穴埋めされました`
          : makeupCount > 0
          ? `${dayData!.count}枚投稿`
          : undefined
      }
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
            className="absolute inset-0 w-full h-full object-cover grayscale opacity-70"
            loading="lazy"
          />
          {/* 日付の視認性確保のための下方グラデーション */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 bg-muted/50" />
      )}

      {/* 穴埋め元（2枚以上投稿した日）: 右上に琥珀の丸＋「+」（正確な枚数はtitleで） */}
      {makeupCount > 0 && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 z-10 flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-amber-400 text-[8px] sm:text-[13px] font-bold leading-none text-amber-950 ring-1 ring-black/15 shadow-sm">
          +
        </span>
      )}

      {/* 穴埋め済み（空き日が後日のダブル投稿で埋まった）: 右上に灰色の丸＋「補」（詳細はtitleで） */}
      {isFilledHole && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 z-10 flex h-4 w-4 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-zinc-500/90 text-[8px] sm:text-[13px] font-bold leading-none text-white ring-1 ring-black/15 shadow-sm">
          埋
        </span>
      )}

      {/* 日付。画像・穴埋めセルは暗いサムネ上に重なるため、黒の縁取り（多方向シャドウ）で
          土日の赤青や平日の白がどんな背景でもはっきり読めるようにする。 */}
      <div
        className={`
          absolute bottom-0.5 left-1/2 -translate-x-1/2
          text-xs sm:text-sm font-semibold
          ${isRed ? (onImage ? "text-red-400" : "text-red-500") : ""}
          ${isBlue ? (onImage ? "text-blue-400" : "text-blue-500") : ""}
          ${!isRed && !isBlue ? (onImage ? "text-white" : "text-muted-foreground") : ""}
        `}
        style={onImage ? { textShadow: TEXT_OUTLINE } : undefined}
      >
        {day}
      </div>
    </button>
  );
}
