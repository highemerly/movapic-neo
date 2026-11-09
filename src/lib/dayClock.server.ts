/**
 * 日付の区切りの DB 読み書き（サーバー専用）。計算は純粋モジュール ./dayClock にある。
 *
 * **`@db.Date` の扱い（pitfall）**
 * - Prisma は DATE 列を「その日付の UTC 0:00」の Date で読み書きする。変換は必ず toDbDate / fromDbDate を通す。
 * - `dayStart()` などの時刻をそのまま DATE 列に書かない。JST の 0 時は UTC では前日 15 時なので、
 *   前日の日付として保存される。
 * - 生 SQL では文字列のまま `${d}::date` で渡す。
 * - クライアントへは PostDate（文字列）だけを渡す。UTC 0:00 の Date を渡すと、UTC より西の
 *   タイムゾーンのブラウザでは前日に見える。
 */

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import {
  applyBoundaryChange,
  asPostDate,
  planBoundaryChange,
  todayOf,
  type BoundaryEntry,
  type PostDate,
} from "./dayClock";

type Db = typeof prisma | Prisma.TransactionClient;

/** 記録日を DATE 列に書く値にする。 */
export function toDbDate(d: PostDate): Date {
  return new Date(`${d}T00:00:00Z`);
}

/** DATE 列から読んだ値を記録日にする。 */
export function fromDbDate(d: Date): PostDate {
  return asPostDate(d.toISOString().slice(0, 10));
}

/** 記録日の範囲（両端を含む）を postDate 列の条件にする。 */
export function postDateBetween(from: PostDate, to: PostDate): { gte: Date; lte: Date } {
  return { gte: toDbDate(from), lte: toDbDate(to) };
}

/** DB から読んだ行の postDate を記録日（文字列）にする。 */
export function withPostDate<T extends { postDate: Date }>(
  rows: ReadonlyArray<T>
): Array<Omit<T, "postDate"> & { postDate: PostDate }> {
  return rows.map((r) => ({ ...r, postDate: fromDbDate(r.postDate) }));
}

/**
 * ユーザーの区切りの履歴（日付順）。行は変更のたびに高々1つ増えるだけなので全件読む
 * （範囲で絞ると、範囲より前の最新の行を取りこぼして区切りを 0 時と誤るため）。
 */
export async function loadSchedule(userId: string, db: Db = prisma): Promise<BoundaryEntry[]> {
  const rows = await db.dayBoundarySetting.findMany({
    where: { userId },
    orderBy: { fromDate: "asc" },
    select: { fromDate: true, hour: true },
  });
  return rows.map((r) => ({ fromDate: fromDbDate(r.fromDate), hour: r.hour }));
}

/** ユーザーの今日（記録日）。 */
export async function loadToday(userId: string, now: Date, db: Db = prisma): Promise<PostDate> {
  return todayOf(await loadSchedule(userId, db), now);
}

/**
 * 区切りを hour に変える（翌日、まれに翌々日から効く。規則は planBoundaryChange）。
 * 変更後の履歴と、計算に使った時刻を返す（画面に「いつから」を出すため）。
 *
 * 「読む → 適用開始日を計算 → 書く」をユーザー単位の advisory lock で直列化する。並行した2つの変更が
 * 同じ古い履歴から計算すると、片方の削除が他方の予約を消し損ねて、過去を動かす行が残りうるため。
 * now はロックを取った後に取る（待たされた間に境界を過ぎても、過ぎた境界を動かさないように）。
 */
export function changeDayBoundary(
  userId: string,
  hour: number
): Promise<{ schedule: BoundaryEntry[]; now: Date }> {
  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock は void を返し、Prisma が void 列を読めずに失敗するため int の1行に包む。
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`day-boundary:${userId}`}, 0))) AS l`;
    const now = new Date();
    const current = await loadSchedule(userId, tx);
    const plan = planBoundaryChange(current, hour, now);
    await tx.dayBoundarySetting.deleteMany({
      where: { userId, fromDate: { gte: toDbDate(plan.deleteFrom) } },
    });
    if (plan.insert) {
      await tx.dayBoundarySetting.create({
        data: { userId, fromDate: toDbDate(plan.insert.fromDate), hour: plan.insert.hour },
      });
    }
    return { schedule: applyBoundaryChange(current, plan), now };
  });
}
