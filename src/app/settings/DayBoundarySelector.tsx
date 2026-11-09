"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SegmentControl } from "@/components/SegmentControl";
import { SettingField } from "@/components/SettingRow";
import { DAY_BOUNDARY_HOURS, describeBoundarySchedule } from "@/lib/dayClock";
import { parseApiError, formatErrorMessage } from "@/lib/errors";
import { SETTINGS_TOAST_DURATION, toastSettingsError } from "./settingsToast";

interface Upcoming {
  fromDate: string;
  hour: number;
}

interface DayBoundarySelectorProps {
  /** 今日の区切り（時）。 */
  initialTodayHour: number;
  /** 今日より後に効く変更（予約・最大2件・日付順）。 */
  initialUpcoming: Upcoming[];
}

const OPTIONS = DAY_BOUNDARY_HOURS.map(String);

/**
 * 日付の区切り（1日の始まりの時刻）の選択。
 * 選択中の値は「最後に予約した区切り」＝予約が無ければ今日の区切り。
 * 変更は翌日（まれに翌々日）から効くので、保存しても「今日から効いた」とは見せず、返ってきた
 * 予約の日付でトーストに「11/10から2時区切りになります（今日は0時区切りのままです）」と出す（画面の説明文は短く保つ）。
 * 選択肢は「0時」〜「4時」と短くする（スマホで5つ並べても文字を詰めずに読めるように）。
 */
export function DayBoundarySelector({ initialTodayHour, initialUpcoming }: DayBoundarySelectorProps) {
  const [todayHour, setTodayHour] = useState(initialTodayHour);
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [isSaving, setIsSaving] = useState(false);
  const selected = upcoming.length > 0 ? upcoming[upcoming.length - 1].hour : todayHour;

  const handleChange = async (value: string) => {
    const hour = Number(value);
    if (hour === selected) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/v1/me/day-boundary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hour }),
      });
      if (!res.ok) throw new Error(formatErrorMessage(await parseApiError(res)));
      const data = (await res.json()) as { todayHour: number; upcoming: Upcoming[] };
      setTodayHour(data.todayHour);
      setUpcoming(data.upcoming);
      toast.success(describeBoundarySchedule(data.todayHour, data.upcoming), {
        id: "settings-day-boundary",
        // いつから効くかを読んでもらうため、通常の「保存しました」より長く出す。
        duration: SETTINGS_TOAST_DURATION * 2,
      });
    } catch (err) {
      toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  // 見出しと説明は他の設定行（SettingRow の RowBody）と同じ書式にそろえる。
  return (
    <SettingField className="space-y-2">
      <div>
        <p className="text-sm">1日の区切り</p>
        <div className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
          カレンダー・連続投稿・皆勤賞などの1日の区切りを変更します（翌日以降反映されます）。
        </div>
      </div>
      <SegmentControl
        value={String(selected)}
        options={OPTIONS}
        onChange={handleChange}
        disabled={isSaving}
        renderOption={(value) => `${value}時`}
      />
    </SettingField>
  );
}
