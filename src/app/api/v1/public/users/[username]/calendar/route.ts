/**
 * カレンダー用API
 * GET /api/v1/public/users/[username]/calendar?year=2025&month=3
 *
 * 指定月の画像データを日付ごとにグループ化して返す
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseUserHandle } from "@/lib/userHandle";
import { toJstDateString } from "@/lib/streak";
import { CACHE_PUBLIC_MEDIUM } from "@/lib/http";
import {
  currentMonthMakeupStatus,
  daysInMonthOf,
  isPerfectMonth,
  makeupsForCalendar,
  perfectMonthGrace,
  type MakeupMatch,
} from "@/lib/achievements/perfectMonth";

interface DayData {
  count: number;
  /** カレンダーのサムネに使う画像。複数投稿日はその日の最古の投稿。 */
  latest: {
    id: string;
    thumbnailKey: string | null;
    storageKey: string;
    position: string;
  };
}

/** 穴埋め済みの空き日（後日のダブル投稿で埋まった日）。カレンダーで2枚目サムネ＋緑表示にする。 */
interface FilledDay {
  /** 埋められた空き日(1-31)。 */
  day: number;
  /** その穴を埋めた（ダブル投稿した）日(1-31)。 */
  filledBy: number;
  /** filledBy 日に「2枚目に投稿した写真」（穴埋めの決め手）。サムネ＋リンク先に使う。 */
  image: { id: string; thumbnailKey: string | null; storageKey: string };
}

/** 皆勤賞の達成状況・穴埋め進捗（UIの👑とコールアウト表示に使う）。未来月では null。 */
interface PerfectMonthInfo {
  achieved: boolean;
  isCurrentMonth: boolean;
  /**
   * 当月の穴埋めコールアウト種別。
   * - "today": 未埋めの穴があり、今日まだ穴埋めしていない（本日2枚投稿で埋められる）
   * - "tomorrow": 今日は穴埋め済みだが穴が残り、翌日以降に埋められる
   * - null: 表示しない（穴なし／皆勤不能／月末で埋める後日なし）
   */
  callout: "today" | "tomorrow" | null;
  /** 後日のダブル投稿で「埋まった空き日」。カレンダーで穴埋め済み表示にする。 */
  filledDays: FilledDay[];
}

interface CalendarResponse {
  year: number;
  month: number;
  days: Record<number, DayData>;
  hasPrevMonth: boolean;
  hasNextMonth: boolean;
  isPerfectAttendance: boolean;
  perfectMonth: PerfectMonthInfo | null;
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
      return NextResponse.json(
        { error: "Invalid year or month" },
        { status: 400 }
      );
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

    // 指定月の開始・終了日時（JSTで計算）
    // Note: createdAtはUTCで保存されているので、JSTに変換して日付を判定する必要がある
    const startDate = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0)); // JST 00:00 = UTC -9時間
    const endDate = new Date(Date.UTC(year, month, 1, -9, 0, 0)); // 翌月1日 JST 00:00

    // 指定月の画像を取得
    const images = await prisma.image.findMany({
      where: {
        userId: user.id,
        isPublic: true,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        id: true,
        thumbnailKey: true,
        storageKey: true,
        position: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 日付ごとにグループ化
    const days: Record<number, DayData> = {};
    // 日(1-31) -> その日の画像（createdAt 降順＝新しい順。穴埋めの「2枚目」抽出に使う）
    const dayImages = new Map<number, { id: string; thumbnailKey: string | null; storageKey: string }[]>();

    for (const image of images) {
      // JSTに変換して日付を取得
      const jstDate = new Date(image.createdAt.getTime() + 9 * 60 * 60 * 1000);
      const day = jstDate.getUTCDate();

      if (!days[day]) {
        days[day] = {
          count: 1,
          latest: {
            id: image.id,
            thumbnailKey: image.thumbnailKey,
            storageKey: image.storageKey,
            position: image.position,
          },
        };
      } else {
        days[day].count++;
        // サムネはその日の最古の投稿を使う。images は createdAt 降順なので
        // 後に来るものほど古い → 毎回上書きすれば最終的に最古が残る。
        days[day].latest = {
          id: image.id,
          thumbnailKey: image.thumbnailKey,
          storageKey: image.storageKey,
          position: image.position,
        };
      }

      if (!dayImages.has(day)) dayImages.set(day, []);
      dayImages.get(day)!.push({
        id: image.id,
        thumbnailKey: image.thumbnailKey,
        storageKey: image.storageKey,
      });
    }

    // 前月に投稿があるかチェック
    const prevMonthStart = new Date(Date.UTC(year, month - 2, 1, -9, 0, 0));
    const prevMonthEnd = startDate;
    const hasPrevMonth = await prisma.image.findFirst({
      where: {
        userId: user.id,
        isPublic: true,
        createdAt: {
          gte: prevMonthStart,
          lt: prevMonthEnd,
        },
      },
      select: { id: true },
    });

    // 翌月に投稿があるかチェック（未来は常にfalse）
    // 「今月」は必ず JST 基準で判定する。サーバーのローカルTZ（本番=UTC）で
    // getFullYear/getMonth すると、JST が新しい月に入っても UTC がまだ前月の
    // 時間帯（JST 00:00〜09:00）に「先月＝当月」と誤判定し、todayDayNum（JST基準）
    // と食い違って穴埋め表示が壊れる。todayDayNum と同じ toJstDateString に揃える。
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
          createdAt: {
            gte: nextMonthStart,
            lt: nextMonthEnd,
          },
        },
        select: { id: true },
      });
      hasNextMonth = !!nextMonthImage;
    }

    // 皆勤賞判定（穴埋め込み。未来月以外＝過去月・当月で判定）。
    // 達成条件・進捗計算は perfectMonth.ts に集約（live/backfill と同一ロジック）。
    const isCurrentMonth = year === currentYear && month === currentMonth;
    const isFutureMonth = year > currentYear || (year === currentYear && month > currentMonth);

    let isPerfectAttendance = false;
    let perfectMonth: PerfectMonthInfo | null = null;

    if (!isFutureMonth) {
      const daysInMonth = daysInMonthOf(year, month);
      // 未投稿許容日数（穴埋め枠）はカレンダーの持ち主の所属インスタンスで決まる。
      const grace = perfectMonthGrace(domain);
      // 日(1-31)→投稿数。穴埋めの日付順マッチング・達成判定の単一ソースに渡す。
      const dayCounts: Record<number, number> = {};
      for (const [dayStr, d] of Object.entries(days)) dayCounts[Number(dayStr)] = d.count;

      isPerfectAttendance = isPerfectMonth({ daysInMonth, dayCounts, grace });

      // 穴埋め対応（古い穴 ← 後日のダブル・grace 件まで）。当月は今日まで、過去月は月末まで。
      // 表示用マッチは makeupsForCalendar に一本化（grace 上限を perfectMonth.ts 内に閉じ込める）。
      const todayDayNum = isCurrentMonth ? Number(toJstDateString(now).slice(8, 10)) : null;
      const matches: MakeupMatch[] = makeupsForCalendar({ daysInMonth, todayDayNum, dayCounts, grace });
      let callout: "today" | "tomorrow" | null = null;
      if (isCurrentMonth && todayDayNum != null) {
        const status = currentMonthMakeupStatus({ daysInMonth, todayDayNum, dayCounts, grace });
        // コールアウトは「まだ皆勤に届く範囲で、未埋めの穴が残る」ときだけ。
        if (status.unfilled > 0 && status.stillAchievable) {
          if (!status.todayUsedMakeup) callout = "today";
          else if (todayDayNum < daysInMonth) callout = "tomorrow";
        }
      }

      // 各穴埋めに、埋めた日の「2枚目に投稿した写真」を添える（dayImages は新しい順なので末尾-1）。
      const filledDays: FilledDay[] = [];
      for (const m of matches) {
        const imgs = dayImages.get(m.filledBy);
        if (!imgs || imgs.length < 2) continue;
        const second = imgs[imgs.length - 2]; // 時系列で2枚目に投稿した写真
        filledDays.push({ day: m.holeDay, filledBy: m.filledBy, image: second });
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
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": CACHE_PUBLIC_MEDIUM,
      },
    });
  } catch (error) {
    console.error("Calendar API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
