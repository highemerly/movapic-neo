/**
 * 日付の区切り（1日の始まりの時刻）の変更
 * PUT /api/v1/me/day-boundary  body: { hour: 0〜4 }
 *
 * 変更は翌日（まれに翌々日）から効く。過去と今日の記録日は動かさない（規則は dayClock.planBoundaryChange）。
 * 返り値の upcoming（今日より後に効く変更・最大2件）で、画面に「いつから何時区切りになるか」を出す。
 * 仕様は docs/features.md「日付の区切り」。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ErrorCodes, errorResponse } from "@/lib/errors";
import { hourOn, isValidBoundaryHour, todayOf, upcomingChanges } from "@/lib/dayClock";
import { changeDayBoundary } from "@/lib/dayClock.server";

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401);
    }

    const body = await request.json().catch(() => null);
    const hour = typeof body === "object" && body !== null ? (body as { hour?: unknown }).hour : undefined;
    if (!isValidBoundaryHour(hour)) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "日付の区切りは0〜4時から選んでください", 400);
    }

    const { schedule, now } = await changeDayBoundary(user.id, hour);
    return NextResponse.json(
      {
        success: true,
        todayHour: hourOn(schedule, todayOf(schedule, now)),
        upcoming: upcomingChanges(schedule, now),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Failed to change day boundary:", error);
    return errorResponse(ErrorCodes.INTERNAL_ERROR, "日付の区切りの保存に失敗しました", 500);
  }
}
