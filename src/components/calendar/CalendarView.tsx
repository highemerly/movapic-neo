"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayCell } from "./DayCell";
import { DayDetailModal } from "./DayDetailModal";

interface DayData {
  count: number;
  latest: {
    id: string;
    thumbnailKey: string | null;
    storageKey: string;
    position: string;
  };
}

interface CalendarData {
  year: number;
  month: number;
  days: Record<number, DayData>;
  hasPrevMonth: boolean;
  hasNextMonth: boolean;
  isPerfectAttendance: boolean;
}

interface CalendarViewProps {
  username: string;
  publicUrl: string;
  initialYear: number;
  initialMonth: number;
}


export function CalendarView({
  username,
  publicUrl,
  initialYear,
  initialMonth,
}: CalendarViewProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
    fetchCalendarData();
  }, [fetchCalendarData]);

  const goToPrevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
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

  // 未来の月かどうか
  const isFutureMonth =
    year > today.getFullYear() ||
    (year === today.getFullYear() && month > today.getMonth() + 1);

  return (
    <div className="w-full">
      {/* ナビゲーション */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevMonth}
          disabled={loading}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-bold min-w-[160px] text-center">
          {data?.isPerfectAttendance && <span className="mr-1">&#128081;</span>}
          {year}年{month}月
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          disabled={loading || isFutureMonth}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, index) => (
          <DayCell
            key={index}
            day={day}
            dayData={day ? data?.days[day] : undefined}
            publicUrl={publicUrl}
            isToday={isCurrentMonth && day === today.getDate()}
            isSunday={index % 7 === 0}
            isSaturday={index % 7 === 6}
            loading={loading}
            onClick={() => day && data?.days[day] && setSelectedDay(day)}
          />
        ))}
      </div>

      {/* 日付詳細モーダル */}
      {selectedDay && data?.days[selectedDay] && (
        <DayDetailModal
          username={username}
          year={year}
          month={month}
          day={selectedDay}
          publicUrl={publicUrl}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
