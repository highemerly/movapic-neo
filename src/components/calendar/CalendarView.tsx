"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface PerfectMonthInfo {
  achieved: boolean;
  daysInMonth: number;
  postedDays: number;
  makeupBank: number;
  allowance: number;
  isCurrentMonth: boolean;
  skippedSoFar: number | null;
  shortfall: number | null;
  stillAchievable: boolean | null;
  shouldRemind: boolean;
  filledDays: number[];
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
}


/**
 * 穴埋めを促す注意書き（当月のみ）。
 * 表示するのは「穴埋めができる かつ 過ぎた未投稿が上限以内」のときだけ（shouldRemind）。
 * 達成/未達成のメッセージは出さない（達成時は月見出しの👑で示す）。
 */
function PerfectMonthCallout({ pm }: { pm: PerfectMonthInfo }) {
  if (!pm.shouldRemind) return null;
  const skipped = pm.skippedSoFar ?? 0;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
      <Crown className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">今月は未投稿が{skipped}日あります</p>
        <p>
          別日に1日<span className="font-bold">2枚以上</span>投稿すると穴埋めできます（穴埋めできるのは最大{pm.allowance}日／1ヶ月）。
        </p>
      </div>
    </div>
  );
}

export function CalendarView({
  username,
  publicUrl,
  initialYear,
  initialMonth,
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
        `/api/v1/public/users/${username}/calendar?year=${year}&month=${month}`
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

  // ダブル投稿で「埋まった空き日」。穴埋め済みセルとして緑表示する。
  const filledDays = new Set(data?.perfectMonth?.filledDays ?? []);

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
          {data?.isPerfectAttendance && <span className="mr-1">&#128081;</span>}
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

      {/* 皆勤賞・穴埋めのコールアウト（当月のみ） */}
      {data?.perfectMonth && <PerfectMonthCallout pm={data.perfectMonth} />}

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, index) => (
          <DayCell
            key={index}
            day={day}
            dayData={day ? data?.days[day] : undefined}
            isFilledHole={day != null && filledDays.has(day)}
            publicUrl={publicUrl}
            isToday={isCurrentMonth && day === today.getDate()}
            isSunday={index % 7 === 0}
            isSaturday={index % 7 === 6}
            loading={loading}
            onClick={() => {
              if (day && data?.days[day]) {
                const imageId = data.days[day].latest.id;
                router.push(`/u/${username}/status/${imageId}`);
              }
            }}
          />
        ))}
      </div>

    </div>
  );
}
