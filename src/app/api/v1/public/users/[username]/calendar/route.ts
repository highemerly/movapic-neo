/**
 * カレンダー用API
 * GET /api/v1/public/users/[username]/calendar?year=2025&month=3
 *
 * 指定月の画像データを日付ごとにグループ化して返す。
 * 代表サムネ・穴埋め表示・皆勤賞の解決は resolveCalendarMonth（単一ソース）に集約。
 * カレンダー画像（コラージュ）生成も同じ関数を使うため、表示と共有画像が食い違わない。
 * 閲覧者が本人（owner）のときだけ、編集モード用の候補画像ペイロード（ownerEdit）を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseUserHandle } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import { getCurrentUser } from "@/lib/auth/session";
import { toJstDateString } from "@/lib/streak";
import { CACHE_PUBLIC_MEDIUM } from "@/lib/http";
import {
  calendarMonthRange,
  fetchCalendarImages,
  resolveCalendarMonth,
  type DayData,
  type FilledDay,
} from "@/lib/calendar/resolveMonth";

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

    // ユーザーを検索（username@domain で解決。domain 省略はホームインスタンスのみ）
    const parsed = parseUserHandle(username, getHomeServer());
    if (!parsed) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const user = await prisma.user.findFirst({
      where: { username: parsed.username, instance: { domain: parsed.domain } },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 閲覧者が本人か（owner なら編集用ペイロードを返し、キャッシュも private にする）
    const viewer = await getCurrentUser();
    const isOwner = viewer?.id === user.id;

    // 指定月の画像を取得（新しい順）→ 代表サムネ・穴埋め・皆勤賞を単一ソースで解決。
    const images = await fetchCalendarImages(user.id, year, month);
    const resolved = resolveCalendarMonth({
      images,
      year,
      month,
      domain: parsed.domain,
      now: new Date(),
    });

    // owner編集用: 各日の全画像（chronological asc）。images は desc なので unshift で整列。
    let ownerEdit: OwnerEditData | undefined;
    if (isOwner) {
      const dayImages: OwnerEditData["dayImages"] = {};
      // resolveCalendarMonth と同じ JST 日付でグルーピングする。
      // desc（新しい順）を維持したまま各日で unshift＝chronological asc。
      const desc = [...images].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      for (const image of desc) {
        const day = Number(toJstDateString(image.createdAt).slice(8, 10));
        if (!dayImages[day]) dayImages[day] = [];
        dayImages[day].unshift({
          id: image.id,
          thumbnailKey: image.thumbnailKey,
          storageKey: image.storageKey,
          isPicked: image.calendarPickedAt != null,
          makeupTargetDay: image.makeupTargetDay,
        });
      }
      ownerEdit = { dayImages };
    }

    // 前月に投稿があるか（前月の範囲＝当月 startDate の直前月）。
    const { startDate } = calendarMonthRange(year, month);
    const { startDate: prevMonthStart } = calendarMonthRange(
      month === 1 ? year - 1 : year,
      month === 1 ? 12 : month - 1
    );
    const hasPrevMonth = await prisma.image.findFirst({
      where: {
        userId: user.id,
        isPublic: true,
        isDisabled: false,
        createdAt: { gte: prevMonthStart, lt: startDate },
      },
      select: { id: true },
    });

    // 過去月のみ翌月投稿の有無をチェック（当月・未来月は不要）。
    let hasNextMonth = false;
    if (!resolved.isCurrentMonth && !resolved.isFutureMonth) {
      const { startDate: nextMonthStart, endDate: nextMonthEnd } = calendarMonthRange(
        month === 12 ? year + 1 : year,
        month === 12 ? 1 : month + 1
      );
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

    const perfectMonth: PerfectMonthInfo | null = resolved.isFutureMonth
      ? null
      : {
          achieved: resolved.isPerfectAttendance,
          isCurrentMonth: resolved.isCurrentMonth,
          callout: resolved.callout,
          filledDays: resolved.filledDays,
        };

    const response: CalendarResponse = {
      year,
      month,
      days: resolved.days,
      hasPrevMonth: !!hasPrevMonth,
      hasNextMonth,
      isPerfectAttendance: resolved.isPerfectAttendance,
      perfectMonth,
      ...(ownerEdit ? { ownerEdit } : {}),
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
