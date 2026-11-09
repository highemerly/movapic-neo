/**
 * カレンダー用API
 * GET /api/v1/public/users/[username]/calendar?year=2025&month=3
 *
 * 指定月の画像データを日付ごとにグループ化して返す。
 * 代表サムネ・穴埋め表示・皆勤賞の解決は resolveCalendarMonth（単一ソース）に集約。
 * カレンダー画像（コラージュ）生成も同じ関数を使うため、表示と共有画像が食い違わない。
 * 閲覧者が本人（owner）のときだけ、編集モード用の候補画像ペイロード（ownerEdit）と
 * 穴埋め枠（perfectMonth.makeup：残ポイント・締切・付与履歴）を返す。
 *
 * 穴埋めの上限はカレンダー持ち主で決まり閲覧者に依存しないので、非ownerの公開キャッシュは安全。
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseUserHandle } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import { getCurrentUser } from "@/lib/auth/session";
import { CACHE_PUBLIC_MEDIUM } from "@/lib/http";
import { formatYm, isValidYearMonth, shiftYm } from "@/lib/jst";
import { dayOfMonth, firstDayOfYm, hourOn, lastDayOfYm, todayOf, ymOf } from "@/lib/dayClock";
import { loadSchedule, postDateBetween } from "@/lib/dayClock.server";
import { resolveMakeupLimits } from "@/lib/makeup/ledger";
import { allowsPrevMonthDonor, donorTargetYm } from "@/lib/makeup/donor";
import { isMakeupEditable, makeupDeadlineAt } from "@/lib/makeup/points";
import type { MonthDaysGoal } from "@/lib/achievements/monthDays";
import {
  fetchCalendarImages,
  resolveCalendarMonth,
  type DayData,
  type FilledDay,
  type MakeupCallout,
} from "@/lib/calendar/resolveMonth";

/** owner だけに返す、その月の穴埋め枠。 */
interface MakeupInfo {
  /** ポイント制（2026-10 以降）の月か。false なら limit は所属インスタンスで決まる固定の日数。 */
  pointEra: boolean;
  /** その月に埋められる上限（ポイント制なら付与ポイント合計）。 */
  limit: number;
  /** 埋めている穴の数。 */
  used: number;
  /** 埋めている穴の日（昇順）。消費の内訳表示用（いつ使ったかは記録していないので日付だけ）。 */
  usedDays: number[];
  /** あと何日ぶん埋められるか。 */
  remaining: number;
  /** まだ埋まっていない未投稿日の数（当月は昨日まで）。 */
  unfilled: number;
  /**
   * 穴埋めの締切の時刻（表示用・この時刻より前なら編集可）。ISO 8601。持ち主の区切りで決まる
   * （2時区切りなら翌月11日 2:00 JST）。編集できるかは editable を見る。
   */
  deadline: string;
  /** 今この月の穴埋めを指定・解除できるか（締切前かつ未来月でない）。 */
  editable: boolean;
  /** 持ち主の今日の日付の区切り（時）。説明文の「1日の区切り」に出す。 */
  dayBoundaryHour: number;
  /** 付与履歴（古い順）。従来ルールの月は空。 */
  grants: Array<{ reason: string; amount: number; grantedAt: string }>;
  /** この月の皆勤賞にまだ手が届くか（達成済みも true）。false なら案内を月間投稿日数の目標に切り替える。 */
  perfectAchievable: boolean;
  /** 1枚以上投稿した日数（穴埋めは数えない）。 */
  postedDays: number;
  /** 月間投稿日数の次の目標。 */
  monthDaysGoal: MonthDaysGoal;
}

/** 皆勤賞の達成状況・穴埋め進捗（UIの👑とコールアウト表示に使う）。未来月では null。 */
interface PerfectMonthInfo {
  achieved: boolean;
  isCurrentMonth: boolean;
  callout: MakeupCallout | null;
  filledDays: FilledDay[];
  /** owner のときだけ。 */
  makeup?: MakeupInfo;
}

/** owner（本人）だけに返す編集モード用の画像1枚。 */
interface OwnerEditImage {
  id: string;
  thumbnailKey: string | null;
  storageKey: string;
  /** この画像がその日の代表（calendarPickedAt あり）か。 */
  isPicked: boolean;
  /** この画像が埋めている穴の日(1-31)。null=穴埋めに使っていない。 */
  makeupTargetDay: number | null;
  /**
   * その穴がある月 "YYYY-MM"。null=穴埋めに使っていない。
   * 月またぎ donor があるため、日だけでは「どの穴に使用中か」が決まらない。
   */
  makeupTargetMonth: string | null;
}

/** owner（本人）だけに返す編集モード用データ。各日の全画像（chronological asc）。 */
interface OwnerEditData {
  dayImages: Record<number, OwnerEditImage[]>;
  /**
   * 翌月1〜10日の画像（日 → 画像）。この月の穴を埋める donor 候補になる。
   * 月末日を忘れると後日が無く埋まらない非対称を無くすため、締切までに投稿した写真は翌月のものでも使える。
   */
  nextMonthDayImages?: Record<number, OwnerEditImage[]>;
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

    if (!isValidYearMonth(year, month)) {
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
    // 穴埋めの上限は持ち主の所属インスタンス（従来ルールの月）か台帳（ポイント制の月）で決まる。
    // 日・今日は持ち主の記録日（日付の区切り）で決める。閲覧者の区切りは使わない。
    const ym = formatYm(year, month);
    const schedule = await loadSchedule(user.id);
    const today = todayOf(schedule, new Date());
    const [images, limits] = await Promise.all([
      fetchCalendarImages(user.id, year, month),
      resolveMakeupLimits({ userId: user.id, instanceDomain: parsed.domain, ym, today }),
    ]);
    const resolved = resolveCalendarMonth({
      images,
      year,
      month,
      makeupCap: limits.cap,
      potentialCap: limits.potentialCap,
      today,
    });

    // owner編集用: 各日の全画像（chronological asc）。images は desc なので unshift で整列。
    // images は締切（翌月10日）までを含むので、当月ぶんと翌月ぶんを別の入れ物に分ける
    // （日番号をキーにするため、10/3 と 11/3 を同じバケツに入れてはいけない）。
    let ownerEdit: OwnerEditData | undefined;
    if (isOwner) {
      const dayImages: OwnerEditData["dayImages"] = {};
      const nextMonthDayImages: OwnerEditData["dayImages"] = {};
      // resolveCalendarMonth と同じ記録日でグルーピングする。
      // desc（新しい順）を維持したまま各日で unshift＝chronological asc。
      const desc = [...images].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      for (const image of desc) {
        const day = dayOfMonth(image.postDate);
        const imageYm = ymOf(image.postDate);
        const bucket = imageYm === ym ? dayImages : nextMonthDayImages;
        if (!bucket[day]) bucket[day] = [];
        bucket[day].unshift({
          id: image.id,
          thumbnailKey: image.thumbnailKey,
          storageKey: image.storageKey,
          isPicked: image.calendarPickedAt != null,
          makeupTargetDay: image.makeupTargetDay,
          makeupTargetMonth:
            image.makeupTargetDay == null
              ? null
              : donorTargetYm(imageYm, image.makeupTargetMonthDelta),
        });
      }
      ownerEdit = {
        dayImages,
        ...(allowsPrevMonthDonor(ym) ? { nextMonthDayImages } : {}),
      };
    }

    // 前月に投稿があるか（記録日が前月の投稿）。
    const prevYm = shiftYm(ym, -1);
    const hasPrevMonth = await prisma.image.findFirst({
      where: {
        userId: user.id,
        isPublic: true,
        isDisabled: false,
        postDate: postDateBetween(firstDayOfYm(prevYm), lastDayOfYm(prevYm)),
      },
      select: { id: true },
    });

    // 過去月のみ翌月投稿の有無をチェック（当月・未来月は不要）。
    let hasNextMonth = false;
    if (!resolved.isCurrentMonth && !resolved.isFutureMonth) {
      const nextYm = shiftYm(ym, 1);
      const nextMonthImage = await prisma.image.findFirst({
        where: {
          userId: user.id,
          isPublic: true,
          isDisabled: false,
          postDate: postDateBetween(firstDayOfYm(nextYm), lastDayOfYm(nextYm)),
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
          ...(isOwner
            ? {
                makeup: {
                  pointEra: limits.pointEra,
                  limit: limits.cap,
                  used: new Set(resolved.filledHoleDays).size,
                  usedDays: [...new Set(resolved.filledHoleDays)].sort((a, b) => a - b),
                  remaining: resolved.makeupRemaining,
                  unfilled: resolved.unfilledDays,
                  deadline: makeupDeadlineAt(schedule, ym).toISOString(),
                  editable: isMakeupEditable(ym, today),
                  dayBoundaryHour: hourOn(schedule, today),
                  grants: limits.grants.map((g) => ({
                    reason: g.reason,
                    amount: g.amount,
                    grantedAt: g.grantedAt.toISOString(),
                  })),
                  perfectAchievable: resolved.perfectAchievable,
                  postedDays: resolved.postedDays,
                  monthDaysGoal: resolved.monthDaysGoal,
                },
              }
            : {}),
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
