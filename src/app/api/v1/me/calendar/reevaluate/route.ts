/**
 * POST /api/v1/me/calendar/reevaluate  （owner専用）
 * body: { year: number, month: number }
 *
 * カレンダー編集モードを終了した瞬間に、その月の皆勤賞を再判定する（付与のみ・剥奪なし）。
 * 実効的に効くのは「③OFF のユーザーが後から手動で穴を埋めて皆勤を成立させた」ケース
 *（③ON は投稿時に貪欲最適で判定済みなので、ここで新規付与は起きない）。
 * 判定は永続割当（Image.makeupTargetDay）を数える＝カレンダー表示と👑が食い違わない。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { toJstDateString } from "@/lib/streak";
import {
  PERFECT_MONTH_CATEGORY,
  daysInMonthOf,
  isPerfectMonth,
  perfectMonthGrace,
  perfectMonthKey,
} from "@/lib/achievements/perfectMonth";

/** その画像の JST 日(1-31)。 */
function jstDay(createdAt: Date): number {
  return Number(toJstDateString(createdAt).slice(8, 10));
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "year と month が不正です" }, { status: 400 });
    }

    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const key = perfectMonthKey(ym);

    // 既に付与済みなら何もしない（剥奪はしない）
    const owned = await prisma.achievement.findFirst({
      where: { userId: user.id, key },
      select: { id: true },
    });
    if (owned) {
      return NextResponse.json({ success: true, granted: false });
    }

    // 月の全画像（実績と同じ集合＝isPublic/isDisabledで絞らない）
    const monthStart = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 1, -9, 0, 0));
    const monthImages = await prisma.image.findMany({
      where: { userId: user.id, createdAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, makeupTargetDay: true },
    });
    if (monthImages.length === 0) {
      return NextResponse.json({ success: true, granted: false });
    }

    const dayCounts: Record<number, number> = {};
    for (const m of monthImages) {
      const d = jstDay(m.createdAt);
      dayCounts[d] = (dayCounts[d] ?? 0) + 1;
    }
    const filledHoleDays = monthImages
      .map((m) => m.makeupTargetDay)
      .filter((v): v is number => v != null && (dayCounts[v] ?? 0) === 0);

    const grace = perfectMonthGrace(user.instance.domain);
    const daysInMonth = daysInMonthOf(year, month);
    if (!isPerfectMonth({ daysInMonth, dayCounts, filledHoleDays, grace })) {
      return NextResponse.json({ success: true, granted: false });
    }

    // 付与＋通知（imageId は通知サムネ用にその月の最新投稿）。並行付与は P2002 で握りつぶす。
    const imageId = monthImages[0].id;
    try {
      await prisma.achievement.create({
        data: { userId: user.id, key, category: PERFECT_MONTH_CATEGORY, imageId },
      });
      await prisma.notification.create({
        data: { userId: user.id, type: "achievement", achievementKey: key, imageId },
      });
    } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002") {
        return NextResponse.json({ success: true, granted: false });
      }
      throw e;
    }

    return NextResponse.json({ success: true, granted: true, key });
  } catch (error) {
    console.error("Calendar reevaluate failed:", error);
    return NextResponse.json({ error: "再判定に失敗しました" }, { status: 500 });
  }
}
