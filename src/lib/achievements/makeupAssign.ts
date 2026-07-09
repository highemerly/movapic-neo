/**
 * 穴埋め割当の永続化（サーバー専用）。
 *
 * 穴埋め割当は Image.makeupTargetDay に持ち、カレンダー表示・皆勤賞判定の両方がこれを読む。
 * ここは「その永続値を書く」side（DBアクセスを伴う）。純粋な割当規則は perfectMonth.ts の
 * pickMakeupHole / assignMonthMakeups に集約し、ここはそれを DB に橋渡しするだけ。
 *
 * - assignMakeupForNewPost: live。投稿の瞬間に autoMakeup=true のとき1件割り当てる。
 * - recomputeMonthMakeups:  削除後の自己修復。月の割当を現在の投稿から全再計算して貼り直す。
 */

import prisma from "@/lib/db";
import { toJstDateString } from "@/lib/streak";
import { assignMonthMakeups, pickMakeupHole } from "./perfectMonth";

/** JST 月境界（calendar route と同じ計算）。JST 00:00 = UTC -9時間。 */
function jstMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, -9, 0, 0));
  return { start, end };
}

/** その画像の JST 日(1-31)。 */
function jstDay(createdAt: Date): number {
  return Number(toJstDateString(createdAt).slice(8, 10));
}

/**
 * 投稿の瞬間に自動穴埋め割当を最大1件書く（autoMakeup=true のときだけ呼ぶ）。
 * この投稿の JST 日がダブル投稿日になり、まだその日に donor 割当が無く、過去に未割当の穴があれば、
 * その最古の穴を makeupTargetDay に書く。
 *
 * 実績評価（collectStats）より前に呼ぶこと（＝書いた割当を含めて皆勤賞判定させる）。
 * 投稿フローを止めないよう呼び出し側で try/catch する。
 * 集計対象は「全投稿」（collectStats と同一。isPublic/isDisabled で絞らない＝実績挙動を不変に保つ）。
 */
export async function assignMakeupForNewPost(args: {
  userId: string;
  imageId: string;
  createdAt: Date;
  /** 穴埋め枠の上限（投稿者の所属インスタンスで決まる。perfectMonthGrace(domain)）。 */
  grace: number;
}): Promise<void> {
  const { userId, imageId, createdAt, grace } = args;
  const jst = toJstDateString(createdAt);
  const year = Number(jst.slice(0, 4));
  const month = Number(jst.slice(5, 7));
  const postDay = Number(jst.slice(8, 10));
  const { start, end } = jstMonthRange(year, month);

  const rows = await prisma.image.findMany({
    where: { userId, createdAt: { gte: start, lt: end } },
    select: { id: true, createdAt: true, makeupTargetDay: true },
  });

  const dayCounts: Record<number, number> = {};
  const filledHoleDays: number[] = [];
  let postDayHasDonor = false;
  for (const r of rows) {
    const d = jstDay(r.createdAt);
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
    if (r.makeupTargetDay != null) {
      filledHoleDays.push(r.makeupTargetDay);
      // この投稿以外に、同じ日の donor が既にいるか（1日1donorを守る）
      if (d === postDay && r.id !== imageId) postDayHasDonor = true;
    }
  }

  const hole = pickMakeupHole({ dayCounts, filledHoleDays, postDay, postDayHasDonor, grace });
  if (hole != null) {
    await prisma.image.update({ where: { id: imageId }, data: { makeupTargetDay: hole } });
  }
}

/**
 * ある月の穴埋め割当を全再計算して貼り直す（削除後の自己修復・autoMakeup=true のときだけ呼ぶ）。
 * 現在の投稿から assignMonthMakeups（live と同一の貪欲規則）で割当を求め、差分だけ update
 * （割当されなくなった投稿は null に戻す）。③OFF ユーザーの月は手動運用なので呼ばない。
 */
export async function recomputeMonthMakeups(args: {
  userId: string;
  year: number;
  month: number;
  /** 穴埋め枠の上限（投稿者の所属インスタンスで決まる。perfectMonthGrace(domain)）。 */
  grace: number;
}): Promise<void> {
  const { userId, year, month, grace } = args;
  const { start, end } = jstMonthRange(year, month);
  const rows = await prisma.image.findMany({
    where: { userId, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, makeupTargetDay: true },
  });
  const assigned = assignMonthMakeups(
    rows.map((r) => ({ id: r.id, day: jstDay(r.createdAt) })),
    grace
  );
  const updates = rows
    .filter((r) => (assigned.get(r.id) ?? null) !== r.makeupTargetDay)
    .map((r) =>
      prisma.image.update({
        where: { id: r.id },
        data: { makeupTargetDay: assigned.get(r.id) ?? null },
      })
    );
  if (updates.length > 0) await prisma.$transaction(updates);
}
