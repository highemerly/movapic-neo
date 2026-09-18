/**
 * 画像削除後の穴埋め割当の失効掃除（サーバー専用）。
 *
 * 穴埋めの donor は「2枚以上投稿した日の写真」でなければならない。ところが判定側
 * （countValidFilledHoles）は「穴が本当に空き日か」しか見ておらず、「donor の日がまだ2枚以上か」は
 * 見ていない。そのため「2枚投稿 → 穴埋め指定 → 1枚削除」で、1枚しか無い日の写真が穴を埋めたまま
 * 残る。従来は削除後の再計算（recomputeMonthMakeups）がこれを偶然掃除していたが、自動穴埋めを
 * やめると表面化し、ポイント制では「1pt で2日ぶん得をする」抜け穴になる。
 *
 * ここでは代わりの写真を選んで付け替えることはしない（システムが穴埋めを決める＝自動穴埋めの復活になる）。
 * 外れた割当のポイントは導出なので自動的に戻り、締切内ならユーザーが手動で埋め直せる。
 *
 * 判定側に「donor の日が2枚以上か」の検証を足さないのは、過去データを遡って無効化し、
 * 既に👑が付いた月の表示が非達成に見える事故になるため。削除の時点で前向きに直す。
 *
 * 月またぎ donor（翌月1〜10日の投稿で前月を埋めたもの）も同じ経路で直る。失効の条件は
 * 「donor **自身の日**が2枚未満になったか」なので、見るのは常に削除した画像の月＝donor の月であり、
 * どの月の穴を埋めているかは関係しない。
 */

import prisma from "@/lib/db";
import { jstDayOf, jstMonthRange, parseYm, toJstYm } from "@/lib/jst";

/**
 * 削除後に残った同月の画像から、失効した割当（その日の投稿が2枚未満になった donor）の id を返す（純粋）。
 * deletedDay は削除した画像の JST 日。
 */
export function staleDonorIdsAfterDelete(
  remaining: ReadonlyArray<{ id: string; createdAt: Date; makeupTargetDay: number | null }>,
  deletedDay: number
): string[] {
  const sameDay = remaining.filter((r) => jstDayOf(r.createdAt) === deletedDay);
  if (sameDay.length >= 2) return [];
  return sameDay.filter((r) => r.makeupTargetDay != null).map((r) => r.id);
}

/**
 * 画像を削除した後に呼ぶ。失効した割当を外して、外した件数を返す。
 * 画像削除自体は常に成功させる（プライバシー優先）ので、呼び出し側で .catch すること。
 */
export async function healAfterImageDelete(args: {
  userId: string;
  deletedCreatedAt: Date;
}): Promise<number> {
  const { userId, deletedCreatedAt } = args;
  const { year, month } = parseYm(toJstYm(deletedCreatedAt));
  const { start, end } = jstMonthRange(year, month);
  const remaining = await prisma.image.findMany({
    where: { userId, createdAt: { gte: start, lt: end } },
    select: { id: true, createdAt: true, makeupTargetDay: true },
  });
  const ids = staleDonorIdsAfterDelete(remaining, jstDayOf(deletedCreatedAt));
  if (ids.length === 0) return 0;
  const { count } = await prisma.image.updateMany({
    where: { id: { in: ids } },
    data: { makeupTargetDay: null, makeupTargetMonthDelta: 0 },
  });
  return count;
}
