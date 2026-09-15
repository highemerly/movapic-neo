/**
 * JST（日本標準時）の年月・日・月境界を扱う純粋ユーティリティ。
 *
 * サーバの「今日/今月」は必ず JST で判定する（`new Date().getMonth()` は本番UTCで前月を返す）。
 * その土台である「UTC+9時間ずらす」計算は streak.ts の `toJstDateString` 1箇所だけが持ち、
 * ここはその上に「年月(YYYY-MM)」「日(1-31)」「月境界(UTC Date)」を積む。
 *
 * 集約した理由（pitfall）: 同じ月境界の式 `Date.UTC(y, m-1, 1, -9, 0, 0)` が resolveMonth.ts /
 * makeupAssign.ts / reevaluate/route.ts の3箇所に、`jstDay` が2箇所に重複定義されていた。
 * それぞれ別のテストが境界を検証していたため、片方だけ直しても気づけない構造だった。
 *
 * React・サーバー専用 API・env を import しないこと（クライアントからも読まれる）。
 */

import { toJstDateString } from "@/lib/streak";

/** JST の年月 "YYYY-MM"。 */
export function toJstYm(d: Date): string {
  return toJstDateString(d).slice(0, 7);
}

/** JST の日(1-31)。 */
export function jstDayOf(d: Date): number {
  return Number(toJstDateString(d).slice(8, 10));
}

/** "2026-10" → { year: 2026, month: 10 }（month は1始まり）。 */
export function parseYm(ym: string): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
}

/** { year, month } → "2026-10"（month は1始まり）。 */
export function formatYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * 年月を delta ヶ月ずらす。"2026-01" の -1 は "2025-12"。
 * 年またぎを各所で手書きしないための単一ソース。
 */
export function shiftYm(ym: string, delta: number): string {
  const { year, month } = parseYm(ym);
  // 0始まりに直してから加算すると、年またぎが除算と剰余だけで書ける。
  const zero = year * 12 + (month - 1) + delta;
  return formatYm(Math.floor(zero / 12), (zero % 12) + 1);
}

/**
 * JST 月の境界を UTC Date で返す（start 以上 end 未満）。JST 00:00 = UTC -9時間。
 * DB クエリの `createdAt: { gte: start, lt: end }` にそのまま渡せる。
 */
export function jstMonthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, -9, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, -9, 0, 0)),
  };
}

/** "2026-10" 版の `jstMonthRange`。 */
export function jstMonthRangeOfYm(ym: string): { start: Date; end: Date } {
  const { year, month } = parseYm(ym);
  return jstMonthRange(year, month);
}

/** JST のその日の 00:00 を UTC Date で返す（通知の「1日1通」判定などの下限に使う）。 */
export function jstDayStart(d: Date): Date {
  const [year, month, day] = toJstDateString(d).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
}
