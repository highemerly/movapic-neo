/**
 * admin の期間ピッカー共通定義（/admin/stats・/admin/favorites 共用）。
 *
 * 期間は「絶対レンジ [from, to)」に正規化する（to は排他終端）。
 *   - ローリング窓（直近N）: to = now、from = now - N。
 *   - カレンダー期間（先月/先週/昨日）: JST の暦境界。週は日曜始まり（カレンダー機能に合わせる）。
 *   - 全期間（all）: null（下流が DB の最古〜現在に委ねる）。
 * すべて JST 基準。JST は UTC+9 固定なので +9h シフトで壁時計を作って暦計算する。
 */

import { toJstDateString } from "@/lib/streak";

export type Period =
  | "all"
  | "last-month"
  | "last-week"
  | "yesterday"
  | "31d"
  | "7d"
  | "72h"
  | "24h"
  | "1h";

export interface PeriodOption {
  value: Period;
  label: string;
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "all", label: "全期間" },
  { value: "last-month", label: "先月" },
  { value: "last-week", label: "先週" },
  { value: "yesterday", label: "昨日" },
  { value: "31d", label: "直近31日" },
  { value: "7d", label: "直近7日" },
  { value: "72h", label: "直近72時間" },
  { value: "24h", label: "直近24時間" },
  { value: "1h", label: "直近1時間" },
];

const VALUES = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));

export function normalizePeriod(v: string | undefined, fallback: Period): Period {
  return v && VALUES.has(v) ? (v as Period) : fallback;
}

export interface PeriodRange {
  from: Date;
  to: Date;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
const JST_OFFSET = 9 * HOUR;

/** JST の今日 0:00 を表す実 Date（＝ UTC では前日15:00）。 */
function jstMidnightToday(now: Date): Date {
  return new Date(`${toJstDateString(now)}T00:00:00+09:00`);
}

/** JST の暦月初 0:00 を表す実 Date。 */
function jstMonthStart(year: number, month1to12: number): Date {
  const y = String(year).padStart(4, "0");
  const m = String(month1to12).padStart(2, "0");
  return new Date(`${y}-${m}-01T00:00:00+09:00`);
}

/** 期間 → 絶対レンジ [from, to)。all は null。 */
export function periodRange(p: Period, now: Date): PeriodRange | null {
  switch (p) {
    case "all":
      return null;
    case "1h":
      return { from: new Date(now.getTime() - HOUR), to: now };
    case "24h":
      return { from: new Date(now.getTime() - 24 * HOUR), to: now };
    case "72h":
      return { from: new Date(now.getTime() - 72 * HOUR), to: now };
    case "7d":
      return { from: new Date(now.getTime() - 7 * DAY), to: now };
    case "31d":
      return { from: new Date(now.getTime() - 31 * DAY), to: now };
    case "yesterday": {
      const today0 = jstMidnightToday(now);
      return { from: new Date(today0.getTime() - DAY), to: today0 };
    }
    case "last-week": {
      const today0 = jstMidnightToday(now);
      // JST の曜日（0=日）。日曜始まりの「今週頭」を出し、その1週前が先週。
      const dow = new Date(today0.getTime() + JST_OFFSET).getUTCDay();
      const thisWeek0 = new Date(today0.getTime() - dow * DAY);
      return { from: new Date(thisWeek0.getTime() - 7 * DAY), to: thisWeek0 };
    }
    case "last-month": {
      const [y, m] = toJstDateString(now).split("-").map(Number); // m: 1-12
      const thisMonth0 = jstMonthStart(y, m);
      const lastMonth0 = m === 1 ? jstMonthStart(y - 1, 12) : jstMonthStart(y, m - 1);
      return { from: lastMonth0, to: thisMonth0 };
    }
  }
}

const JST = "Asia/Tokyo";
const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: JST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: JST,
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ピッカー下段の「いつから〜いつまで」テキスト（JST）。 */
export function periodRangeText(p: Period, now: Date): string {
  if (p === "all") return "全期間";
  const r = periodRange(p, now)!;
  // 時刻精度で見せたい窓（時次相当）は分まで、それ以外は日付のみ。
  if (p === "1h" || p === "24h" || p === "72h") {
    return `${dateTimeFmt.format(r.from)} 〜 ${dateTimeFmt.format(r.to)}`;
  }
  // カレンダー期間は排他終端を1日戻して inclusive 表示（例: 昨日→単一日、先週→日〜土）。
  const calendar = p === "yesterday" || p === "last-week" || p === "last-month";
  const end = calendar ? new Date(r.to.getTime() - DAY) : r.to;
  const fromStr = dateFmt.format(r.from);
  const endStr = dateFmt.format(end);
  return fromStr === endStr ? fromStr : `${fromStr} 〜 ${endStr}`;
}
