/**
 * カレンダー画像（コラージュ）のプレビュー生成API
 * POST /api/v1/calendar/collage/generate
 *
 * 認証必須（自分のカレンダーのみ）。指定月のサムネ一覧を1枚の画像に合成して返す。
 * 「代表サムネ・穴埋め・皆勤賞」はカレンダー表示と同じ resolveCalendarMonth を使うので
 * 画面のカレンダーと一致する。生成のみ・投稿はしない（プレビュー用）。
 *
 * body(JSON): { year, month }
 * out: 生成画像 binary（JPEG）＋ ヘッダ X-Caption（URLエンコード済みの投稿本文）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import {
  fetchCalendarImages,
  resolveCalendarMonth,
  buildCollageCaption,
} from "@/lib/calendar/resolveMonth";
import { getImage } from "@/lib/storage/storage";
import { renderCalendarCollage } from "@/lib/compute/client";
import { isJapaneseHoliday } from "@/lib/holidays";
import type { CalendarCell } from "@/lib/calendar/collageTypes";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    let body: { year?: unknown; month?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
    }
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "年月が不正です" }, { status: 400 });
    }

    const images = await fetchCalendarImages(user.id, year, month);
    const resolved = resolveCalendarMonth({
      images,
      year,
      month,
      domain: user.instance.domain,
      now: new Date(),
    });

    if (resolved.isFutureMonth) {
      return NextResponse.json({ error: "未来の月は作成できません" }, { status: 400 });
    }

    // 各日のセル（投稿のある日＝代表サムネ / 空き日でも穴埋めされていれば donor サムネ）。
    const filledByDay = new Map(resolved.filledDays.map((f) => [f.day, f]));
    const targets: {
      day: number;
      kind: "post" | "makeup";
      key: string;
      filledBy?: number;
    }[] = [];
    for (let day = 1; day <= resolved.daysInMonth; day++) {
      const d = resolved.days[day];
      if (d) {
        targets.push({
          day,
          kind: "post",
          key: d.latest.thumbnailKey ?? d.latest.storageKey,
        });
        continue;
      }
      const filled = filledByDay.get(day);
      if (filled) {
        targets.push({
          day,
          kind: "makeup",
          key: filled.image.thumbnailKey ?? filled.image.storageKey,
          filledBy: filled.filledBy,
        });
      }
    }

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "この月には投稿がありません" },
        { status: 400 }
      );
    }

    // サムネイルを並列取得（取得できなかったセルは欠落＝空きセル扱いにする）。
    const buffers = await Promise.all(targets.map((t) => getImage(t.key)));
    const thumbnails: Buffer[] = [];
    const cells: CalendarCell[] = [];
    targets.forEach((t, i) => {
      const buf = buffers[i];
      if (!buf) return;
      cells.push({
        day: t.day,
        kind: t.kind,
        imageIndex: thumbnails.length,
        filledBy: t.filledBy,
      });
      thumbnails.push(buf);
    });

    if (cells.length === 0) {
      return NextResponse.json(
        { error: "サムネイルの取得に失敗しました" },
        { status: 500 }
      );
    }

    const caption = buildCollageCaption(year, month, resolved.isPerfectAttendance);

    // ウォーターマーク: アプリのドメイン（scheme無し）と著作権（© username@domain）。
    const appDomain = (process.env.NEXT_PUBLIC_APP_URL ?? "")
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    const authorHandle = `@${user.username}@${user.instance.domain}`;

    // その月の祝日（日曜と同じ赤系で色付け・空きセル含め全日に効かせる）。
    const holidays: number[] = [];
    for (let day = 1; day <= resolved.daysInMonth; day++) {
      if (isJapaneseHoliday(year, month, day)) holidays.push(day);
    }

    console.log(
      `[collage-generate] user=${user.username} ${year}-${month} cells=${cells.length} perfect=${resolved.isPerfectAttendance}`
    );

    const result = await renderCalendarCollage(
      {
        year,
        month,
        serviceName: "SHAMEZO",
        appDomain,
        authorHandle,
        isPerfect: resolved.isPerfectAttendance,
        holidays,
        cells,
      },
      thumbnails,
      request.signal
    );

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.buffer.length),
        "X-Caption": encodeURIComponent(caption),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Calendar collage generate error:", error);
    return NextResponse.json({ error: "画像の生成に失敗しました" }, { status: 500 });
  }
}
