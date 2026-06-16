"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isJapaneseHoliday } from "@/lib/holidays";
import { DayCell } from "./DayCell";

interface DayData {
  count: number;
  latest: {
    id: string;
    thumbnailKey: string | null;
    storageKey: string;
    position: string;
  };
}

interface FilledDay {
  day: number;
  filledBy: number;
  image: { id: string; thumbnailKey: string | null; storageKey: string };
}

interface PerfectMonthInfo {
  achieved: boolean;
  isCurrentMonth: boolean;
  callout: "today" | "tomorrow" | null;
  filledDays: FilledDay[];
}

interface CalendarData {
  year: number;
  month: number;
  days: Record<number, DayData>;
  hasPrevMonth: boolean;
  hasNextMonth: boolean;
  isPerfectAttendance: boolean;
  perfectMonth: PerfectMonthInfo | null;
}

interface CalendarViewProps {
  username: string;
  publicUrl: string;
  initialYear: number;
  initialMonth: number;
  /** 閲覧者がこのカレンダーの持ち主本人か（穴埋め促しコールアウトの表示制御）。 */
  isOwner: boolean;
}


/**
 * 穴埋めを促す注意書き（当月のみ）。
 * 表示するのは「まだ皆勤に届く範囲で、未埋めの穴が残る」ときだけ（callout が非 null）。
 * - "today": 本日2枚投稿すれば穴埋めできる
 * - "tomorrow": 今日はもう穴埋め済み（1日1回まで）なので翌日に促す
 * 達成/未達成のメッセージは出さない（達成時は月見出しの👑で示す）。
 */
function PerfectMonthCallout({ pm }: { pm: PerfectMonthInfo }) {
  if (!pm.callout) return null;
  const body =
    pm.callout === "today"
      ? "投稿を忘れた日があります。本日2枚投稿すれば穴埋めでき、皆勤賞に近づきます！"
      : "明日2枚投稿すると、皆勤賞に近づきます！";
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
      <Crown className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">穴埋め投稿で皆勤賞を目指そう！</p>
        <p>{body}</p>
      </div>
    </div>
  );
}

/**
 * 皆勤賞を達成した月に表示する祝祭バナー（達成月のみ・閲覧者全員に表示）。
 * 金色グラデ＋光沢走査＋王冠ポップ＋きらめきで「達成」を派手に演出する。
 */
function PerfectMonthBanner({ month }: { month: number }) {
  return (
    <div className="animate-celebrate-in relative mb-3 overflow-hidden rounded-xl bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-4 py-3 shadow-md dark:from-amber-900/50 dark:via-yellow-800/30 dark:to-amber-900/50">
      {/* 斜めの光沢が左から右へ走る */}
      <div className="animate-banner-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/50 blur-md dark:bg-white/10" />
      <div className="relative flex items-center justify-center gap-2 text-amber-900 dark:text-amber-100">
        <span className="animate-sparkle text-lg leading-none">✨</span>
        <Crown className="animate-trophy-pop h-6 w-6 shrink-0 fill-amber-400 text-amber-600 drop-shadow-sm dark:text-amber-300" />
        <span className="text-base font-extrabold tracking-wide sm:text-lg">
          {month}月 皆勤賞達成！
        </span>
        <span className="animate-sparkle text-lg leading-none" style={{ animationDelay: "0.7s" }}>
          ✨
        </span>
      </div>
    </div>
  );
}

export function CalendarView({
  username,
  publicUrl,
  initialYear,
  initialMonth,
  isOwner,
}: CalendarViewProps) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/public/users/${encodeURIComponent(username)}/calendar?year=${year}&month=${month}`
      );
      if (response.ok) {
        const json = await response.json();
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch calendar data:", error);
    } finally {
      setLoading(false);
    }
  }, [username, year, month]);

  useEffect(() => {
    // year/month/username 変更時にサーバーからカレンダーを再取得する正当なデータフェッチ。
    // 先頭の setLoading(true) を同期 setState と見なす誤検知のため、この行のみ無効化する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCalendarData();
  }, [fetchCalendarData]);

  // URLを更新する（履歴に追加せずに置き換え）
  const updateUrl = (newYear: number, newMonth: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(newYear));
    url.searchParams.set("month", String(newMonth));
    window.history.replaceState({}, "", url.toString());
  };

  const goToPrevMonth = () => {
    let newYear = year;
    let newMonth = month;
    if (month === 1) {
      newYear = year - 1;
      newMonth = 12;
    } else {
      newMonth = month - 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    updateUrl(newYear, newMonth);
  };

  const goToNextMonth = () => {
    let newYear = year;
    let newMonth = month;
    if (month === 12) {
      newYear = year + 1;
      newMonth = 1;
    } else {
      newMonth = month + 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    updateUrl(newYear, newMonth);
  };

  // カレンダーのグリッドを生成
  const generateCalendarGrid = () => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const grid: (number | null)[] = [];

    // 前月の空白セル
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push(null);
    }

    // 当月の日付
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push(day);
    }

    // 6週分（42セル）になるまで埋める
    while (grid.length < 42) {
      grid.push(null);
    }

    return grid;
  };

  const grid = generateCalendarGrid();
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  // 後日のダブル投稿で「埋まった空き日」。日→穴埋め情報のマップ（穴埋め済みセルの緑表示・遷移に使う）。
  const filledByDay = new Map<number, FilledDay>(
    (data?.perfectMonth?.filledDays ?? []).map((f) => [f.day, f])
  );

  // 未来の月かどうか
  const isFutureMonth =
    year > today.getFullYear() ||
    (year === today.getFullYear() && month > today.getMonth() + 1);

  return (
    <div className="w-full">
      {/* ナビゲーション */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={goToPrevMonth}
          disabled={loading}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-base font-bold min-w-[120px] text-center">
          {year}年{month}月
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={goToNextMonth}
          disabled={loading || isFutureMonth}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* 皆勤賞達成バナー（達成月のみ・閲覧者全員に表示） */}
      {data?.perfectMonth?.achieved && <PerfectMonthBanner month={data.month} />}

      {/* 穴埋め促しコールアウト（本人かつ未達成で穴埋め可能なとき） */}
      {isOwner && data?.perfectMonth && <PerfectMonthCallout pm={data.perfectMonth} />}

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, index) => {
          const filled = day != null ? filledByDay.get(day) : undefined;
          return (
            <DayCell
              key={index}
              day={day}
              dayData={day ? data?.days[day] : undefined}
              filledMakeup={filled ? { filledBy: filled.filledBy, image: filled.image } : undefined}
              publicUrl={publicUrl}
              isToday={isCurrentMonth && day === today.getDate()}
              isSunday={index % 7 === 0}
              isSaturday={index % 7 === 6}
              isHoliday={day != null && isJapaneseHoliday(year, month, day)}
              loading={loading}
              onClick={() => {
                if (day && data?.days[day]) {
                  router.push(`/u/${username}/status/${data.days[day].latest.id}`);
                } else if (filled) {
                  // 穴埋め済みセルは「埋めた日の2枚目の写真」へ遷移
                  router.push(`/u/${username}/status/${filled.image.id}`);
                }
              }}
            />
          );
        })}
      </div>

      {/* 凡例＋穴埋め制度の説明 */}
      <div className="mt-4 space-y-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <Crown className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
          皆勤賞を目指そう！
        </p>
        <p>
          あの月に毎日投稿すると、皆勤賞の称号が得られます。万が一投稿を忘れてしまっても、同月の後日に1日2枚以上投稿すれば、忘れた日を「穴埋め」できます（穴埋め投稿は1日につき1回まで・月につき4回まで）。
        </p>

        {/* マーカーの凡例 */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold leading-none text-amber-950 ring-1 ring-black/15">
              +
            </span>
            <span>2枚以上投稿した日</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-500/90 text-[8px] font-bold leading-none text-white ring-1 ring-black/15">
              埋
            </span>
            <span>穴埋めされた日</span>
          </div>
        </div>

      </div>

    </div>
  );
}
