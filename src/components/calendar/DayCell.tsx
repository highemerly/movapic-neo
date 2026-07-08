"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { StackedSquaresIcon } from "./StackedSquaresIcon";

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
  /** カレンダー編集モード。空きセルも含め全日をクリック可能にし、編集用の枠線を出す。 */
  editMode?: boolean;
  /** 本人の当月「今日」で未投稿のとき、投稿導線の「＋」を表示しクリック可能にする。 */
  showAddPost?: boolean;
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
  editMode = false,
  showAddPost = false,
  onClick,
}: DayCellProps) {
  // サムネ読み込み完了までシマー（パルス）で隠し、完了後にフェードイン
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // キャッシュ済み等で onLoad 前に読み込み完了しているケースを拾う
    if (imgRef.current?.complete) setImgLoaded(true);
  }, []);

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
  // 編集モードでは空きセルも含め全日をクリック可能（代表選択／穴埋め割当のため）。
  // 本人の当日未投稿セルは「＋」投稿導線としてクリック可能にする。
  const clickable = editMode ? true : hasImage || isFilledHole || showAddPost;

  return (
    <button
      onClick={onClick}
      disabled={!clickable || loading}
      title={
        showAddPost
          ? "今日の画像を投稿する"
          : isFilledHole
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
        ${editMode ? "ring-1 ring-dashed ring-primary/50" : ""}
        ${loading ? "animate-pulse" : ""}
      `}
    >
      {/* 背景画像またはプレースホルダー（穴埋め済みは2枚目サムネ＋緑オーバーレイ） */}
      {hasImage && imageUrl ? (
        <>
          {/* 読み込み中はシマーで隠す */}
          {!imgLoaded && (
            <div
              className="absolute inset-0 animate-pulse bg-muted"
              aria-hidden
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`${day}日の投稿`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
          />
          {/* オーバーレイ */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </>
      ) : isFilledHole && filledImageUrl ? (
        <>
          {/* 読み込み中はシマーで隠す */}
          {!imgLoaded && (
            <div
              className="absolute inset-0 animate-pulse bg-muted"
              aria-hidden
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={filledImageUrl}
            alt={`${day}日の穴埋め（${filledMakeup!.filledBy}日の投稿）`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover grayscale transition-opacity duration-300 ${
              imgLoaded ? "opacity-70" : "opacity-0"
            }`}
            loading="lazy"
          />
          {/* 日付の視認性確保のための下方グラデーション */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </>
      ) : showAddPost ? (
        // 本人の当日未投稿セル: 投稿導線（薄い primary 背景＋プラス＋「投稿」文言）
        <div className="absolute inset-0 flex flex-col items-center justify-start gap-0.5 bg-primary/10 pt-1 sm:pt-1.5">
          <Plus className="h-4 w-4 sm:h-6 sm:w-6 text-primary" strokeWidth={2.5} />
          <span className="text-[9px] font-bold leading-none text-primary sm:text-xs">
            投稿する
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 bg-muted/50" />
      )}

      {/* 穴埋め元（2枚以上投稿した日）: 右上に「□が重なった」アイコンで複数枚を示す（正確な枚数はtitleで） */}
      {makeupCount > 0 && (
        <StackedSquaresIcon
          className="pointer-events-none absolute right-0.5 top-0.5 z-10 h-3 w-3 sm:h-5 sm:w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          strokeWidth={2.5}
        />
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
