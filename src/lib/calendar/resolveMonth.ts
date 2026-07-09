/**
 * カレンダー月データの解決（単一ソース）。
 *
 * 「その月の各日の代表サムネ」「穴埋め（makeup）」「皆勤賞達成」を、永続化された割当
 * （Image.calendarPickedAt / makeupTargetDay）だけから導く純粋ロジック。
 * カレンダーAPI（GET /api/v1/public/.../calendar）と、カレンダー画像（コラージュ）生成の
 * 両方がここを呼ぶことで、「画面のカレンダー」と「共有画像」が必ず一致する。
 *
 * DB取得は fetchCalendarImages に閉じ込め、集計は resolveCalendarMonth（純粋）に分ける。
 */

import prisma from "@/lib/db";
import { toJstDateString } from "@/lib/streak";
import {
  currentMonthMakeupStatus,
  daysInMonthOf,
  isPerfectMonth,
  perfectMonthGrace,
} from "@/lib/achievements/perfectMonth";

/** カレンダーのサムネに使う画像参照。 */
export interface DayImageRef {
  id: string;
  thumbnailKey: string | null;
  storageKey: string;
  position: string;
}

export interface DayData {
  count: number;
  /** calendarPickedAt があればそれ、無ければその日の最古の投稿。 */
  latest: DayImageRef;
}

/** 穴埋め済みの空き日（後日のダブル投稿で埋まった日）。永続割当 makeupTargetDay から構築。 */
export interface FilledDay {
  /** 埋められた空き日(1-31)。 */
  day: number;
  /** その穴を埋めた（ダブル投稿した）日(1-31)。 */
  filledBy: number;
  /** 穴埋めの決め手になった写真（donor＝makeupTargetDay を持つ画像）。 */
  image: { id: string; thumbnailKey: string | null; storageKey: string };
}

/** resolveCalendarMonth が必要とする画像行。fetchCalendarimages の select と一致。 */
export interface CalendarImageRow {
  id: string;
  thumbnailKey: string | null;
  storageKey: string;
  position: string;
  createdAt: Date;
  calendarPickedAt: Date | null;
  makeupTargetDay: number | null;
}

export interface ResolvedCalendarMonth {
  /** 日(1-31) → 代表サムネと件数。投稿のある日のみ。 */
  days: Record<number, DayData>;
  /** 日(1-31) → その日の投稿数。 */
  dayCounts: Record<number, number>;
  /** 表示用の穴埋め（実在する空き日のみ・holeDay 昇順・grace 件まで）。 */
  filledDays: FilledDay[];
  /** 皆勤賞判定の単一ソース（永続割当が指す実在の空き日）。 */
  filledHoleDays: number[];
  isPerfectAttendance: boolean;
  daysInMonth: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  /** 当月の穴埋め促しコールアウト（本人表示用）。 */
  callout: "today" | "tomorrow" | null;
}

/**
 * カレンダー画像の投稿本文（キャプション）。「○年○月 #shamezo」＋皆勤月は👑。
 * カレンダーページURLは投稿関数の imageUrl（本文末尾）に別途付与する。
 */
export function buildCollageCaption(
  year: number,
  month: number,
  isPerfect: boolean
): string {
  return `${year}年${month}月${isPerfect ? " 👑" : ""} #shamezo`;
}

/**
 * 指定月の開始・終了（JST基準・UTC Date）。createdAt は UTC 保存なので JST 00:00 を UTC-9h で表す。
 */
export function calendarMonthRange(
  year: number,
  month: number
): { startDate: Date; endDate: Date } {
  const startDate = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0)); // JST 00:00
  const endDate = new Date(Date.UTC(year, month, 1, -9, 0, 0)); // 翌月1日 JST 00:00
  return { startDate, endDate };
}

/** 指定月の公開画像を createdAt 降順で取得する（カレンダー系で共通利用）。 */
export function fetchCalendarImages(
  userId: string,
  year: number,
  month: number
): Promise<CalendarImageRow[]> {
  const { startDate, endDate } = calendarMonthRange(year, month);
  return prisma.image.findMany({
    where: {
      userId,
      isPublic: true,
      isDisabled: false,
      createdAt: { gte: startDate, lt: endDate },
    },
    select: {
      id: true,
      thumbnailKey: true,
      storageKey: true,
      position: true,
      createdAt: true,
      calendarPickedAt: true,
      makeupTargetDay: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 月内の画像から、代表サムネ・穴埋め・皆勤賞を解決する（純粋関数・DB非依存）。
 * images は createdAt 降順を期待するが、順序に依存しないよう内部で降順ソートする
 *（「最古がその日の代表」ロジックの安全のため）。
 */
export function resolveCalendarMonth(args: {
  images: CalendarImageRow[];
  year: number;
  month: number;
  /** カレンダー持ち主の所属インスタンスドメイン（穴埋め枠 grace の決定に使う）。 */
  domain: string | null | undefined;
  /** 「今日」判定の基準時刻。 */
  now: Date;
}): ResolvedCalendarMonth {
  const { year, month, domain, now } = args;
  // 降順（新しい→古い）に整える。後に来るものほど古く、oldest を毎回上書きで最古が残る。
  const images = [...args.images].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  const days: Record<number, DayData> = {};
  const dayCounts: Record<number, number> = {};
  const rep = new Map<
    number,
    { oldest: DayImageRef; picked: DayImageRef | null; pickedAt: Date | null }
  >();
  const donorRows: {
    holeDay: number;
    filledBy: number;
    image: { id: string; thumbnailKey: string | null; storageKey: string };
  }[] = [];

  for (const image of images) {
    const jst = toJstDateString(image.createdAt);
    const day = Number(jst.slice(8, 10));
    const ref: DayImageRef = {
      id: image.id,
      thumbnailKey: image.thumbnailKey,
      storageKey: image.storageKey,
      position: image.position,
    };

    dayCounts[day] = (dayCounts[day] ?? 0) + 1;

    const cur = rep.get(day);
    if (!cur) {
      rep.set(day, {
        oldest: ref,
        picked: image.calendarPickedAt ? ref : null,
        pickedAt: image.calendarPickedAt ?? null,
      });
    } else {
      cur.oldest = ref;
      if (image.calendarPickedAt && (!cur.pickedAt || image.calendarPickedAt > cur.pickedAt)) {
        cur.picked = ref;
        cur.pickedAt = image.calendarPickedAt;
      }
    }

    if (image.makeupTargetDay != null) {
      donorRows.push({
        holeDay: image.makeupTargetDay,
        filledBy: day,
        image: { id: image.id, thumbnailKey: image.thumbnailKey, storageKey: image.storageKey },
      });
    }
  }

  for (const [day, r] of rep) {
    days[day] = { count: dayCounts[day], latest: r.picked ?? r.oldest };
  }

  // 「今月/未来月」は必ず JST 基準で判定する（UTC で getMonth すると前月へ誤判定）。
  const jstToday = toJstDateString(now);
  const currentYear = Number(jstToday.slice(0, 4));
  const currentMonth = Number(jstToday.slice(5, 7));
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const isFutureMonth =
    year > currentYear || (year === currentYear && month > currentMonth);

  const daysInMonth = daysInMonthOf(year, month);
  let isPerfectAttendance = false;
  let filledDays: FilledDay[] = [];
  let filledHoleDays: number[] = [];
  let callout: "today" | "tomorrow" | null = null;

  if (!isFutureMonth) {
    const grace = perfectMonthGrace(domain);

    filledHoleDays = donorRows.map((d) => d.holeDay).filter((h) => !days[h]);
    isPerfectAttendance = isPerfectMonth({ daysInMonth, dayCounts, filledHoleDays, grace });

    filledDays = donorRows
      .filter((d) => !days[d.holeDay])
      .sort((a, b) => a.holeDay - b.holeDay)
      .slice(0, grace)
      .map((d) => ({ day: d.holeDay, filledBy: d.filledBy, image: d.image }));

    if (isCurrentMonth) {
      const todayDayNum = Number(jstToday.slice(8, 10));
      const status = currentMonthMakeupStatus({
        daysInMonth,
        todayDayNum,
        dayCounts,
        filledHoleDays,
        grace,
      });
      if (status.unfilled > 0 && status.stillAchievable) {
        if (!status.todayUsedMakeup) callout = "today";
        else if (todayDayNum < daysInMonth) callout = "tomorrow";
      }
    }
  }

  return {
    days,
    dayCounts,
    filledDays,
    filledHoleDays,
    isPerfectAttendance,
    daysInMonth,
    isCurrentMonth,
    isFutureMonth,
    callout,
  };
}
