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
import { formatYm, jstMonthRange } from "@/lib/jst";
import { donorRange, donorTargetYm } from "@/lib/makeup/donor";
import {
  canPromptMakeup,
  currentMonthMakeupStatus,
  daysInMonthOf,
  isPerfectMonth,
} from "@/lib/achievements/perfectMonth";

/**
 * 当月の穴埋め促しコールアウト（本人表示用）。
 * - "today":     今日あと1枚（計2枚）投稿すれば穴埋めできる
 * - "ready":     今日すでに2枚以上投稿していて、編集モードから今すぐ穴埋めできる
 * - "tomorrow":  今日はもう穴埋めに使った（1日1donor）ので、明日2枚投稿すれば次を埋められる
 * - "no-points": 皆勤はまだ狙えるが、今はポイントが0（付与を待つ）
 */
export type MakeupCallout = "today" | "ready" | "tomorrow" | "no-points";

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
  /** filledBy の月(1-12)。月またぎ donor（翌月1〜10日の投稿）では対象月と違う。 */
  filledByMonth: number;
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
  makeupTargetMonthDelta: number;
}

export interface ResolvedCalendarMonth {
  /** 日(1-31) → 代表サムネと件数。投稿のある日のみ。 */
  days: Record<number, DayData>;
  /** 日(1-31) → その日の投稿数。 */
  dayCounts: Record<number, number>;
  /** 表示用の穴埋め（実在する空き日のみ・holeDay 昇順・makeupCap 件まで）。 */
  filledDays: FilledDay[];
  /** 皆勤賞判定の単一ソース（永続割当が指す実在の空き日）。 */
  filledHoleDays: number[];
  isPerfectAttendance: boolean;
  daysInMonth: number;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  /** 当月の穴埋め促しコールアウト（本人表示用）。 */
  callout: MakeupCallout | null;
  /** 今の上限で、あと何日ぶん埋められるか（未来月は0）。 */
  makeupRemaining: number;
  /**
   * まだ埋まっていない未投稿日の数（未来月は0）。当月は昨日まで（今日はまだ投稿できるので数えない）、
   * 過去月は月の全日が対象。
   */
  unfilledDays: number;
}

/**
 * カレンダー画像の投稿本文（キャプション）。皆勤月は👑を添える。
 * カレンダーページURLは投稿関数の imageUrl（本文末尾）に別途付与する。
 *
 * 枚数は dayCounts の合計＝その月の投稿数（1日に複数投稿した分も数える。ALT の
 * 「◯日投稿しました」は日数なので単位が違う）。プレビューと投稿でズレないよう、
 * 合計はここでだけ計算する。
 */
export function buildCollageCaption(args: {
  year: number;
  month: number;
  /** 日(1-31) → その日の投稿数。 */
  dayCounts: Record<number, number>;
  isPerfect: boolean;
}): string {
  const { year, month, dayCounts, isPerfect } = args;
  const photos = Object.values(dayCounts).reduce((sum, n) => sum + n, 0);
  return `${year}年${month}月はSHAMEZOに${photos}枚の写真を投稿しました！${isPerfect ? " 👑" : ""} #shamezo`;
}

/**
 * カレンダー画像の代替テキスト(ALT)。
 *
 * 「何月の・何の一覧か」「カレンダー形式であること」「その月に何日投稿したか」まで。
 * 王冠や穴埋めの打ち消し線といった記号の説明は、読み上げが長くなる割に本題ではないので入れない。
 * 個々の写真の内容も説明できないので触れない（本文末尾のカレンダーURLが受け皿）。
 */
export function buildCollageAltText(args: {
  year: number;
  month: number;
  daysInMonth: number;
  /** 実際に投稿した日数（穴埋めで写真が入っただけの日は含めない）。 */
  postedDays: number;
}): string {
  const { year, month, daysInMonth, postedDays } = args;
  return (
    `${year}年${month}月に私がSHAMEZOに投稿した写真の一覧です。` +
    "カレンダー形式で、各日にその日の写真が1枚ずつ並んでいます。" +
    (postedDays >= daysInMonth
      ? `${daysInMonth}日すべて投稿しました。`
      : `${daysInMonth}日のうち${postedDays}日投稿しました。`)
  );
}

/**
 * 指定月の開始・終了（JST基準・UTC Date）。createdAt は UTC 保存なので JST 00:00 を UTC-9h で表す。
 * 境界の式は @/lib/jst の jstMonthRange が単一ソース（ここは呼び出し側の命名に合わせた薄い別名）。
 */
export function calendarMonthRange(
  year: number,
  month: number
): { startDate: Date; endDate: Date } {
  const { start, end } = jstMonthRange(year, month);
  return { startDate: start, endDate: end };
}

/**
 * 指定月の公開画像を createdAt 降順で取得する（カレンダー系で共通利用）。
 *
 * 範囲は月末ではなく穴埋めの締切（翌月10日）まで＝ donorRange。翌月1〜10日の投稿も前月の donor に
 * なれるため、月の範囲だけ読むと穴埋め済みの日を見落とす。対象月の外の行は donor としてだけ効き、
 * 日別の投稿数・代表サムネには数えない（resolveCalendarMonth が月で振り分ける）。
 */
export function fetchCalendarImages(
  userId: string,
  year: number,
  month: number
): Promise<CalendarImageRow[]> {
  const { start, end } = donorRange(formatYm(year, month));
  return prisma.image.findMany({
    where: {
      userId,
      isPublic: true,
      isDisabled: false,
      createdAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      thumbnailKey: true,
      storageKey: true,
      position: true,
      createdAt: true,
      calendarPickedAt: true,
      makeupTargetDay: true,
      makeupTargetMonthDelta: true,
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
  /**
   * その月に穴埋めできる上限（カレンダー持ち主の cap）。呼び出し側が resolveMakeupCap /
   * resolveMakeupLimits（@/lib/makeup/ledger）で解決して渡す。ここで解決しないのは、ポイント制の
   * 月は台帳（DB）を読む必要があり、この関数の純粋性（テストでモック不要）を保つため。
   */
  makeupCap: number;
  /** 月内にまだ付与されうる分も含めた上限（達成可能かの判定にだけ使う）。過去月は makeupCap と同じ。 */
  potentialCap: number;
  /** 「今日」判定の基準時刻。 */
  now: Date;
}): ResolvedCalendarMonth {
  const { year, month, makeupCap, potentialCap, now } = args;
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
    filledByMonth: number;
    image: { id: string; thumbnailKey: string | null; storageKey: string };
  }[] = [];
  // 対象月の中で donor 割当を持つ日。1日1donor は月をまたいで共有するので、他月の穴を
  // 埋めている donor（翌月の穴を埋めることは無いが、前月を埋める donor はここに来る）も数える。
  const donorDaysInMonth = new Set<number>();

  const ym = formatYm(year, month);
  for (const image of images) {
    const jst = toJstDateString(image.createdAt);
    const day = Number(jst.slice(8, 10));
    const imageYm = jst.slice(0, 7);
    const ref: DayImageRef = {
      id: image.id,
      thumbnailKey: image.thumbnailKey,
      storageKey: image.storageKey,
      position: image.position,
    };

    // 対象月の外（＝翌月1〜10日の donor 候補）は穴埋めだけに効かせ、投稿数・代表サムネには数えない。
    if (imageYm !== ym) {
      if (image.makeupTargetDay != null && donorTargetYm(imageYm, image.makeupTargetMonthDelta) === ym) {
        donorRows.push({
          holeDay: image.makeupTargetDay,
          filledBy: day,
          filledByMonth: Number(jst.slice(5, 7)),
          image: { id: image.id, thumbnailKey: image.thumbnailKey, storageKey: image.storageKey },
        });
      }
      continue;
    }

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
      donorDaysInMonth.add(day);
      if (donorTargetYm(imageYm, image.makeupTargetMonthDelta) === ym) {
        donorRows.push({
          holeDay: image.makeupTargetDay,
          filledBy: day,
          filledByMonth: month,
          image: { id: image.id, thumbnailKey: image.thumbnailKey, storageKey: image.storageKey },
        });
      }
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
  let callout: MakeupCallout | null = null;
  let makeupRemaining = 0;
  let unfilledDays = 0;

  if (!isFutureMonth) {
    filledHoleDays = donorRows.map((d) => d.holeDay).filter((h) => !days[h]);
    isPerfectAttendance = isPerfectMonth({ daysInMonth, dayCounts, filledHoleDays, grace: makeupCap });

    filledDays = donorRows
      .filter((d) => !days[d.holeDay])
      .sort((a, b) => a.holeDay - b.holeDay)
      .slice(0, makeupCap)
      .map((d) => ({
        day: d.holeDay,
        filledBy: d.filledBy,
        filledByMonth: d.filledByMonth,
        image: d.image,
      }));
    makeupRemaining = Math.max(0, makeupCap - new Set(filledHoleDays).size);
    // 当月は今日を含めない（まだ投稿できる）。過去月は月末まで。
    const lastCountedDay = isCurrentMonth ? Number(jstToday.slice(8, 10)) - 1 : daysInMonth;
    const filledSet = new Set(filledHoleDays);
    for (let d = 1; d <= lastCountedDay; d++) {
      if (!days[d] && !filledSet.has(d)) unfilledDays++;
    }

    if (isCurrentMonth) {
      const todayDayNum = Number(jstToday.slice(8, 10));
      const status = currentMonthMakeupStatus({
        daysInMonth,
        todayDayNum,
        dayCounts,
        filledHoleDays,
        // 1日1donor は月をまたいで共有するので、前月の穴を埋めた donor も「今日は使用済み」にする。
        todayHasDonor: donorDaysInMonth.has(todayDayNum),
        grace: makeupCap,
        potentialGrace: potentialCap,
      });
      if (status.unfilled > 0 && status.stillAchievable) {
        if (!canPromptMakeup(status)) callout = "no-points";
        else if (status.todayHasDonor) callout = todayDayNum < daysInMonth ? "tomorrow" : null;
        else if (status.todayPosts >= 2) callout = "ready";
        else callout = "today";
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
    makeupRemaining,
    unfilledDays,
  };
}
