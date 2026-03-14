/**
 * カレンダー用API
 * GET /api/v1/public/users/[username]/calendar?year=2025&month=3
 *
 * 指定月の画像データを日付ごとにグループ化して返す
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface DayData {
  count: number;
  latest: {
    id: string;
    thumbnailKey: string | null;
    storageKey: string;
    position: string;
  };
}

interface CalendarResponse {
  year: number;
  month: number;
  days: Record<number, DayData>;
  hasPrevMonth: boolean;
  hasNextMonth: boolean;
  isPerfectAttendance: boolean;
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

    // ユーザーを検索
    const user = await prisma.user.findFirst({
      where: { username },
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
        // 最新の画像は既にorderByで先頭に来ているので更新不要
      }
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
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
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

    // 皆勤賞判定（過去の月のみ、当月は常にfalse）
    let isPerfectAttendance = false;
    const isCurrentMonth = year === currentYear && month === currentMonth;
    const isFutureMonth = year > currentYear || (year === currentYear && month > currentMonth);

    if (!isCurrentMonth && !isFutureMonth) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const postedDays = Object.keys(days).length;
      isPerfectAttendance = postedDays === daysInMonth;
    }

    const response: CalendarResponse = {
      year,
      month,
      days,
      hasPrevMonth: !!hasPrevMonth,
      hasNextMonth,
      isPerfectAttendance,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
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
