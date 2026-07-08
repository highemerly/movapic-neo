/**
 * カレンダー用API
 * GET /api/v1/public/users/[username]/calendar?year=2025&month=3
 *
 * 指定月の画像データを日付ごとにグループ化して返す。
 * 代表サムネ・穴埋め表示・皆勤賞はすべて「永続化された割当（Image.calendarPickedAt /
 * makeupTargetDay）」を読む＝表示と👑判定が食い違わない単一ソース。
 * 閲覧者が本人（owner）のときだけ、編集モード用の候補画像ペイロード（ownerEdit）を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseUserHandle } from "@/lib/userHandle";
import { getCurrentUser } from "@/lib/auth/session";
import { toJstDateString } from "@/lib/streak";
import { CACHE_PUBLIC_MEDIUM } from "@/lib/http";
import {
  currentMonthMakeupStatus,
  daysInMonthOf,
  isPerfectMonth,
  perfectMonthGrace,
} from "@/lib/achievements/perfectMonth";

interface DayImageRef {
  id: string;
  thumbnailKey: string | null;
  storageKey: string;
  position: string;
}

interface DayData {
  count: number;
  /** カレンダーのサムネに使う画像。calendarPickedAt があればそれ、無ければその日の最古の投稿。 */
  latest: DayImageRef;
}

/** 穴埋め済みの空き日（後日のダブル投稿で埋まった日）。永続割当 makeupTargetDay から構築。 */
interface FilledDay {
  /** 埋められた空き日(1-31)。 */
  day: number;
  /** その穴を埋めた（ダブル投稿した）日(1-31)。 */
  filledBy: number;
  /** 穴埋めの決め手になった写真（donor＝makeupTargetDay を持つ画像）。サムネ＋リンク先に使う。 */
  image: { id: string; thumbnailKey: string | null; storageKey: string };
}

/** 皆勤賞の達成状況・穴埋め進捗（UIの👑とコールアウト表示に使う）。未来月では null。 */
interface PerfectMonthInfo {
  achieved: boolean;
  isCurrentMonth: boolean;
  callout: "today" | "tomorrow" | null;
  filledDays: FilledDay[];
}

/** owner（本人）だけに返す編集モード用データ。各日の全画像（chronological asc）。 */
interface OwnerEditData {
  dayImages: Record<
    number,
    Array<{
      id: string;
      thumbnailKey: string | null;
      storageKey: string;
      /** この画像がその日の代表（calendarPickedAt あり）か。 */
      isPicked: boolean;
      /** この画像が埋めている穴の日(1-31)。null=穴埋めに使っていない。 */
      makeupTargetDay: number | null;
    }>
  >;
}

interface CalendarResponse {
  year: number;
  month: number;
  days: Record<number, DayData>;
  hasPrevMonth: boolean;
  hasNextMonth: boolean;
  isPerfectAttendance: boolean;
  perfectMonth: PerfectMonthInfo | null;
  ownerEdit?: OwnerEditData;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const { searchParams } = new URL(request.url);

    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (!yearParam || !monthParam) {
      return NextResponse.json(
        { error: "year and month are required" },
        { status: 400 }
      );
    }

    const year = parseInt(yearParam, 10);
    const month = parseInt(monthParam, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
    }

    // ユーザーを検索（username@domain で解決。domain 省略時は既定インスタンス）
    const { username: cleanUsername, domain } = parseUserHandle(username);
    const user = await prisma.user.findFirst({
      where: { username: cleanUsername, instance: { domain } },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 閲覧者が本人か（owner なら編集用ペイロードを返し、キャッシュも private にする）
    const viewer = await getCurrentUser();
    const isOwner = viewer?.id === user.id;

    // 指定月の開始・終了日時（JSTで計算）。createdAtはUTC保存なのでJST変換して日付判定する。
    const startDate = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0)); // JST 00:00 = UTC -9時間
    const endDate = new Date(Date.UTC(year, month, 1, -9, 0, 0)); // 翌月1日 JST 00:00

    // 指定月の画像を取得（新しい順）
    const images = await prisma.image.findMany({
      where: {
        userId: user.id,
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

    // 日付ごとにグループ化（代表サムネの選定と、owner編集用の全画像リストを同時に作る）
    const days: Record<number, DayData> = {};
    const dayCounts: Record<number, number> = {};
    // 代表決定のワーク: 日 -> { oldest, picked, pickedAt }
    const rep = new Map<
      number,
      { oldest: DayImageRef; picked: DayImageRef | null; pickedAt: Date | null }
    >();
    // owner編集用: 日 -> 全画像（chronological asc で入れる。取得は desc なので後で反転）
    const ownerDayImages: Record<number, OwnerEditData["dayImages"][number]> = {};
    // 穴埋め表示用: makeupTargetDay を持つ画像を集める
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
        // images は desc（新しい順）。後に来るものほど古い → 毎回上書きで最終的に最古が残る。
        cur.oldest = ref;
        // 手動指定（calendarPickedAt）は最新の pick を優先
        if (image.calendarPickedAt && (!cur.pickedAt || image.calendarPickedAt > cur.pickedAt)) {
          cur.picked = ref;
          cur.pickedAt = image.calendarPickedAt;
        }
      }

      // 穴埋め割当（donor）
      if (image.makeupTargetDay != null) {
        donorRows.push({
          holeDay: image.makeupTargetDay,
          filledBy: day,
          image: { id: image.id, thumbnailKey: image.thumbnailKey, storageKey: image.storageKey },
        });
      }

      // owner編集用（desc で unshift＝chronological asc に整列）
      if (isOwner) {
        if (!ownerDayImages[day]) ownerDayImages[day] = [];
        ownerDayImages[day].unshift({
          id: image.id,
          thumbnailKey: image.thumbnailKey,
          storageKey: image.storageKey,
          isPicked: image.calendarPickedAt != null,
          makeupTargetDay: image.makeupTargetDay,
        });
      }
    }

    for (const [day, r] of rep) {
      days[day] = { count: dayCounts[day], latest: r.picked ?? r.oldest };
    }

    // 前月に投稿があるかチェック
    const prevMonthStart = new Date(Date.UTC(year, month - 2, 1, -9, 0, 0));
    const hasPrevMonth = await prisma.image.findFirst({
      where: {
        userId: user.id,
        isPublic: true,
        isDisabled: false,
        createdAt: { gte: prevMonthStart, lt: startDate },
      },
      select: { id: true },
    });

    // 「今月」は必ず JST 基準で判定する（本番=UTC で getMonth すると JST 00:00〜09:00 に前月へ誤判定）。
    const now = new Date();
    const jstToday = toJstDateString(now); // "YYYY-MM-DD"（JST）
    const currentYear = Number(jstToday.slice(0, 4));
    const currentMonth = Number(jstToday.slice(5, 7));
    let hasNextMonth = false;

    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      const nextMonthStart = endDate;
      const nextMonthEnd = new Date(Date.UTC(year, month + 1, 1, -9, 0, 0));
      const nextMonthImage = await prisma.image.findFirst({
        where: {
          userId: user.id,
          isPublic: true,
          isDisabled: false,
          createdAt: { gte: nextMonthStart, lt: nextMonthEnd },
        },
        select: { id: true },
      });
      hasNextMonth = !!nextMonthImage;
    }

    // 皆勤賞判定（穴埋め込み・永続割当ベース。未来月以外＝過去月・当月で判定）。
    const isCurrentMonth = year === currentYear && month === currentMonth;
    const isFutureMonth = year > currentYear || (year === currentYear && month > currentMonth);

    let isPerfectAttendance = false;
    let perfectMonth: PerfectMonthInfo | null = null;

    if (!isFutureMonth) {
      const daysInMonth = daysInMonthOf(year, month);
      // 未投稿許容日数（穴埋め枠）はカレンダーの持ち主の所属インスタンスで決まる。
      const grace = perfectMonthGrace(domain);

      // 永続割当が指す空き日（皆勤賞判定の単一ソース）。実際に空き日(count==0)のもののみ。
      const filledHoleDays = donorRows
        .map((d) => d.holeDay)
        .filter((h) => !days[h]);

      isPerfectAttendance = isPerfectMonth({ daysInMonth, dayCounts, filledHoleDays, grace });

      // 表示用の穴埋め（永続割当から構築）。実在する空き日のみ・holeDay 昇順・grace 件まで
      //（従来の makeupsForCalendar の slice 相当。判定は uncapped だが表示は grace 上限）。
      const filledDays: FilledDay[] = donorRows
        .filter((d) => !days[d.holeDay])
        .sort((a, b) => a.holeDay - b.holeDay)
        .slice(0, grace)
        .map((d) => ({ day: d.holeDay, filledBy: d.filledBy, image: d.image }));

      let callout: "today" | "tomorrow" | null = null;
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

      perfectMonth = { achieved: isPerfectAttendance, isCurrentMonth, callout, filledDays };
    }

    const response: CalendarResponse = {
      year,
      month,
      days,
      hasPrevMonth: !!hasPrevMonth,
      hasNextMonth,
      isPerfectAttendance,
      perfectMonth,
      ...(isOwner ? { ownerEdit: { dayImages: ownerDayImages } } : {}),
    };

    return NextResponse.json(response, {
      headers: {
        // owner は編集用の個人データを含むので共有キャッシュしない。非ownerは従来どおり公開キャッシュ。
        "Cache-Control": isOwner ? "private, no-store" : CACHE_PUBLIC_MEDIUM,
      },
    });
  } catch (error) {
    console.error("Calendar API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
