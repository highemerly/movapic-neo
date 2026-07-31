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
import { isValidFont, type FontFamily } from "@/types";
import type { CalendarCell, CollageTheme } from "@/lib/calendar/collageTypes";

// ルート全体の締め切り。内訳は S3 サムネ取得(最大15s) + compute(最大18s) なので、
// 個々の上限をすべてすり抜けても必ずここで打ち切られる。
const ROUTE_TIMEOUT_MS = 30000;

/** 経過ミリ秒（開始時刻からの差分）。ログの所要時間表示用。 */
function since(startedAt: number): number {
  return Date.now() - startedAt;
}

/** 今どの段階を待っているか。タイムアウト時と長時間待ちのログに出す。 */
type Stage = "auth" | "db" | "s3" | "compute" | "respond";

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const state = { stage: "auth" as Stage };

  // 5秒を超えた場合だけ、どの段階で待っているかを出す（正常時は1行も出ない）。
  const watchdog = setInterval(() => {
    console.warn(`[collage-generate] slow ${since(t0)}ms stage=${state.stage}`);
  }, 5000);

  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<NextResponse>((resolve) => {
    deadline = setTimeout(() => {
      console.error(`[collage-generate] TIMEOUT ${since(t0)}ms stage=${state.stage}`);
      resolve(
        NextResponse.json({ error: "画像の生成がタイムアウトしました" }, { status: 504 })
      );
    }, ROUTE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([generateCollage(request, state, t0), timedOut]);
  } finally {
    clearInterval(watchdog);
    clearTimeout(deadline);
  }
}

async function generateCollage(
  request: NextRequest,
  state: { stage: Stage },
  t0: number
): Promise<NextResponse> {
  try {
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    let body: { year?: unknown; month?: unknown; theme?: unknown; font?: unknown };
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
    // 配色テーマ（未指定・不正値は light）。
    const theme: CollageTheme = body.theme === "dark" ? "dark" : "light";
    // 書体（未指定・不正値・シーズン限定フォントはふい字）。
    const font: FontFamily = isValidFont(body.font) ? body.font : "hui-font";

    state.stage = "db";
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
    // 1本の例外で Promise.all が全体を巻き込まないよう、個別に捕まえる。
    state.stage = "s3";
    const s3Started = Date.now();
    const buffers = await Promise.all(
      targets.map(async (t) => {
        const started = Date.now();
        try {
          return await getImage(t.key);
        } catch (e) {
          // ストレージ側の不調で読めないサムネは空きセルに倒す。件数だけ減って生成は通るので、
          // 気づけるようキーと所要時間を残す。
          console.error(
            `[collage-generate] thumbnail unreadable ${since(started)}ms day=${t.day} key=${t.key}`,
            e
          );
          return null;
        }
      })
    );
    const s3Elapsed = since(s3Started);
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

    const caption = buildCollageCaption({
      year,
      month,
      dayCounts: resolved.dayCounts,
      isPerfect: resolved.isPerfectAttendance,
    });

    // ウォーターマーク: アプリのURL（scheme付き・末尾スラッシュ無し。例: https://pic.handon.club）と
    // 著作権（© username@domain）。
    const appDomain = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    const authorHandle = `@${user.username}@${user.instance.domain}`;

    // その月の祝日（日曜と同じ赤系で色付け・空きセル含め全日に効かせる）。
    const holidays: number[] = [];
    for (let day = 1; day <= resolved.daysInMonth; day++) {
      if (isJapaneseHoliday(year, month, day)) holidays.push(day);
    }

    state.stage = "compute";
    const computeStarted = Date.now();
    const result = await renderCalendarCollage(
      {
        year,
        month,
        serviceName: "SHAMEZO",
        appDomain,
        authorHandle,
        isPerfect: resolved.isPerfectAttendance,
        holidays,
        theme,
        font,
        cells,
      },
      thumbnails,
      request.signal
    );
    state.stage = "respond";
    console.log(
      `[collage-generate] user=${user.username} ${year}-${month} cells=${cells.length}/${targets.length} s3=${s3Elapsed}ms compute=${since(computeStarted)}ms total=${since(t0)}ms`
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
    console.error(`[collage-generate] error ${since(t0)}ms`, error);
    return NextResponse.json({ error: "画像の生成に失敗しました" }, { status: 500 });
  }
}
