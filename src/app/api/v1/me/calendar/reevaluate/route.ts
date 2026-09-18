/**
 * POST /api/v1/me/calendar/reevaluate  （owner専用）
 * body: { year: number, month: number }
 *
 * カレンダー編集モードを終了した瞬間に、その月の皆勤賞を再判定する（付与のみ・剥奪なし）。
 * 手動で穴を埋めて皆勤を成立させたケースで効く（2026-10 以降は穴埋めが手動のみなので常にこの経路）。
 * 判定は永続割当（Image.makeupTargetDay）を数える＝カレンダー表示と👑が食い違わない。
 *
 * 穴埋めの締切（翌月10日）ではゲートしない: 付与のみ・剥奪なしで、締切後は割当が変わらないので
 * 何度呼んでも結果は同じ。締切で塞ぎたい「11日の+1pt を受け取ってから先月を埋めて👑も取る」は、
 * 割当の書き込み（PATCH /api/v1/images/[id]）の締切と、定期ジョブがデータから判定することで塞いでいる。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { evaluateAndGrantPerfectMonth } from "@/lib/achievements/engine";
import { formatYm } from "@/lib/jst";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const year = Number(body.year);
    const month = Number(body.month);
    // 年は4桁に限る: "YYYY-MM" は formatYm / parseYm が4桁前提で切り出すため、桁が違うと
    // 月の切り出しが壊れて Invalid Date のまま DB クエリへ渡り 500 になる。
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      year < 1000 ||
      year > 9999 ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json({ error: "year と month が不正です" }, { status: 400 });
    }

    const { granted, key } = await evaluateAndGrantPerfectMonth({
      userId: user.id,
      instanceDomain: user.instance.domain,
      ym: formatYm(year, month),
    });
    return granted
      ? NextResponse.json({ success: true, granted: true, key })
      : NextResponse.json({ success: true, granted: false });
  } catch (error) {
    console.error("Calendar reevaluate failed:", error);
    return NextResponse.json({ error: "再判定に失敗しました" }, { status: 500 });
  }
}
