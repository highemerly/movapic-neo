/**
 * 穴埋め donor（穴を埋める写真）が属しうる範囲と、割当がどの月の穴を指すかの解決（純粋）。
 *
 * 穴埋めは「忘れた過去日」を「それより後のダブル投稿」で埋める制度だが、donor を同じ月に限ると
 * **月末日を忘れた人だけが構造的に救済不能**になっていた（後日が無い）。締切は元々「翌月10日」なので、
 * 締切までに投稿されたダブル投稿は翌月のものでも donor にできる。これで「穴埋めできる上限」は
 * 穴埋めポイント（cap）だけになり、月内に残っているダブル投稿の機会が暗黙の上限になる状態を解消する。
 *
 * 表現は `Image.makeupTargetDay`（穴の日 1-31）＋ `Image.makeupTargetMonthDelta`（0=同月 / -1=前月）。
 * 既存行は delta=0 で意味が変わらないため、過去月の割当・👑は一切揺れない。
 *
 * **不変条件**
 * - donor は穴より後の日（月をまたいでも日付順は保たれる）。
 * - **1日1donor は月をまたいで共有する**。11/3 を10月の穴埋めに使ったら、11/3 は11月の穴埋めには使えない。
 *   共有しないと1回のダブル投稿で2日ぶん埋まり、1pt で2日得をする。
 * - 月またぎ donor を許すのは**ポイント制（2026-10〜）の対象月だけ**。2026-09 以前の月は投稿時の
 *   自動割当（recomputeMonthMakeups）が同月だけを見て月の割当を組み直すため、月またぎの donor を
 *   知らずに同じ穴へ二重に割り当ててしまう。旧ルールの月は挙動を変えない。
 *
 * catalog.ts / perfectMonth.ts / points.ts と同じくクライアントからも import されうるため、
 * React・サーバー専用 API を import しないこと（型・純粋関数のみ）。
 */

import { jstDayOf, jstMonthRangeOfYm, shiftYm, toJstYm } from "@/lib/jst";
import { isPointEra, makeupDeadline } from "./points";

/** donor と同じ月の穴を埋める（既定）。 */
export const DONOR_SAME_MONTH = 0;
/** 前月の穴を埋める（対象月の翌月1〜10日に投稿した写真）。 */
export const DONOR_PREV_MONTH = -1;

/** 割当が指す穴の月。donor 画像の JST 月と delta から決まる。 */
export function donorTargetYm(donorYm: string, delta: number): string {
  return shiftYm(donorYm, delta);
}

/**
 * 対象月 ym の donor になれる画像の期間（UTC Date・start 以上 end 未満）。
 * end は締切（翌月11日 0:00 JST）そのもの＝「対象月の1日から締切まで」が1本の連続した範囲になる。
 * DB クエリの `createdAt: { gte, lt }` にそのまま渡せる。
 */
export function donorRange(ym: string): { start: Date; end: Date } {
  return { start: jstMonthRangeOfYm(ym).start, end: makeupDeadline(ym) };
}

/** 対象月 ym が月またぎ donor（前月の穴埋め）を許すか。 */
export function allowsPrevMonthDonor(ym: string): boolean {
  return isPointEra(ym);
}

/**
 * donor 画像の JST 月から見た、対象月 ym への delta。donor になれない月なら null。
 * 許すのは「同月」と「対象月の翌月（ポイント制の月のみ）」だけ。
 */
export function donorDeltaFor(donorYm: string, targetYm: string): number | null {
  if (donorYm === targetYm) return DONOR_SAME_MONTH;
  if (donorYm === shiftYm(targetYm, 1) && allowsPrevMonthDonor(targetYm)) return DONOR_PREV_MONTH;
  return null;
}

/** 穴埋め割当の解決に必要な画像行の最小形。 */
export interface DonorRow {
  createdAt: Date;
  makeupTargetDay: number | null;
  makeupTargetMonthDelta: number;
}

/** その行が対象月 ym の穴を埋めているならその穴の日(1-31)、埋めていなければ null。 */
export function filledHoleOf(row: DonorRow, ym: string): number | null {
  if (row.makeupTargetDay == null) return null;
  return donorTargetYm(toJstYm(row.createdAt), row.makeupTargetMonthDelta) === ym
    ? row.makeupTargetDay
    : null;
}

/** 対象月の割当状況（皆勤賞の判定・促し通知・カレンダー表示が共用）。 */
export interface MonthMakeupState {
  /** 対象月の日(1-31) → その日の投稿数。翌月の donor は数えない。 */
  dayCounts: Record<number, number>;
  /** 対象月の穴を埋めている割当の穴の日（重複なし・実在する空き日のみ）。翌月の donor も含む。 */
  filledHoleDays: number[];
  /**
   * 対象月の中で donor 割当を持つ日（1日1donor の判定用）。
   * **他の月の穴を埋めている donor も含める**（1日1donor は月をまたいで共有するため）。
   */
  donorDays: number[];
}

/**
 * donorRange(ym) で読んだ行から対象月の割当状況を組む（純粋）。
 * 対象月の外の行は「翌月の donor」としてだけ効き、投稿数には数えない。
 */
export function buildMonthMakeupState(
  rows: ReadonlyArray<DonorRow>,
  ym: string
): MonthMakeupState {
  const dayCounts: Record<number, number> = {};
  for (const r of rows) {
    if (toJstYm(r.createdAt) !== ym) continue;
    const d = jstDayOf(r.createdAt);
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  }
  const filled = new Set<number>();
  const donors = new Set<number>();
  for (const r of rows) {
    if (r.makeupTargetDay == null) continue;
    if (toJstYm(r.createdAt) === ym) donors.add(jstDayOf(r.createdAt));
    const hole = filledHoleOf(r, ym);
    // 投稿のある日を指す割当は穴埋めとして数えない（countValidFilledHoles と同じ規則）。
    if (hole != null && (dayCounts[hole] ?? 0) === 0) filled.add(hole);
  }
  return { dayCounts, filledHoleDays: [...filled], donorDays: [...donors] };
}
