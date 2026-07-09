/**
 * 穴埋め割当の grace 超過ぶんを掃除するスクリプト（冪等・本番の既存データ修正用）
 *
 * バグ修正: 以前は穴埋め割当（Image.makeupTargetDay）の書き込みに grace 上限を掛けておらず、
 * 表示は grace 件まで（slice）なのに DB には grace を超える割当が残っていた。その結果、
 * 「カレンダー表示上は空き日なのに、その日を埋める写真として使用中扱い」という食い違いが出た。
 *
 * このスクリプトは各ユーザーの各月について、永続割当を「表示と同じ基準」に揃える:
 *  - makeupTargetDay が実際の空き日(その月に投稿ゼロ)を指していない不正な割当 → null に戻す
 *  - 有効な割当のうち、holeDay 昇順で grace 件を超える分（＝表示されない超過分） → null に戻す
 * 触るのは「表示されていない/不正な割当」だけなので、カレンダーの見た目は変わらない。
 * 皆勤賞は missing<=grace の月しか成立せず、超過は非達成月にしか無いので👑にも影響しない。
 *
 * 使用方法:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/cleanup-overcap-makeups.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { toJstDateString } from "@/lib/streak";
import { perfectMonthGrace } from "@/lib/achievements/perfectMonth";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, instance: { select: { domain: true } } },
  });
  console.log(`対象ユーザー: ${users.length}人`);

  let totalCleared = 0;
  let affectedUsers = 0;

  for (const user of users) {
    const grace = perfectMonthGrace(user.instance.domain);
    const images = await prisma.image.findMany({
      where: { userId: user.id },
      select: { id: true, createdAt: true, makeupTargetDay: true },
    });
    if (images.length === 0) continue;

    // 月(ym)ごとに: 日別投稿数 と donor(割当を持つ画像) を集める。
    const dayCountsByMonth = new Map<string, Record<number, number>>();
    const donorsByMonth = new Map<string, { id: string; holeDay: number }[]>();
    for (const img of images) {
      const jst = toJstDateString(img.createdAt);
      const ym = jst.slice(0, 7);
      const day = Number(jst.slice(8, 10));
      if (!dayCountsByMonth.has(ym)) dayCountsByMonth.set(ym, {});
      const dc = dayCountsByMonth.get(ym)!;
      dc[day] = (dc[day] ?? 0) + 1;
      if (img.makeupTargetDay != null) {
        if (!donorsByMonth.has(ym)) donorsByMonth.set(ym, []);
        donorsByMonth.get(ym)!.push({ id: img.id, holeDay: img.makeupTargetDay });
      }
    }

    // クリアすべき donor id を決める。
    const toClear: string[] = [];
    for (const [ym, donors] of donorsByMonth) {
      const dc = dayCountsByMonth.get(ym)!;
      // 有効（空き日を指す）と 不正（投稿のある日を指す）に分ける。
      const valid = donors.filter((d) => (dc[d.holeDay] ?? 0) === 0);
      const invalid = donors.filter((d) => (dc[d.holeDay] ?? 0) !== 0);
      invalid.forEach((d) => toClear.push(d.id)); // 不正割当は無条件でクリア
      // 有効分は holeDay 昇順で grace 件だけ残し、超過をクリア。
      valid.sort((a, b) => a.holeDay - b.holeDay);
      valid.slice(grace).forEach((d) => toClear.push(d.id));
    }

    if (toClear.length > 0) {
      await prisma.image.updateMany({
        where: { id: { in: toClear } },
        data: { makeupTargetDay: null },
      });
      totalCleared += toClear.length;
      affectedUsers++;
      console.log(`  @${user.username}: 超過/不正な穴埋め割当 ${toClear.length}件をクリア`);
    }
  }

  console.log(`完了: クリア 合計 ${totalCleared}件 / 対象ユーザー ${affectedUsers}人`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
