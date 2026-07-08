/**
 * 穴埋め割当の一括 populate スクリプト（一度きり・冪等・手動保護）
 *
 * 目的: カレンダー手動制御機能の導入に伴い、既存投稿に穴埋め割当（Image.makeupTargetDay）を
 * 書き込む。レガシー投稿は全員「自動穴埋め相当」だったので、投稿を時系列リプレイして
 * 貪欲割当（assignMonthMakeups＝live の投稿時割当と同一規則）を求め、donor 投稿へ書く。
 * これにより「表示＝永続割当」に切り替えても、既存ユーザーのカレンダー表示・皆勤賞は不変。
 *
 * 冪等・手動保護: 「そのユーザーに makeupTargetDay が1件も無い」ときだけ実行する
 * （＝未移行ユーザーのみ処理。既に移行済み／手動編集済みのユーザーは丸ごとスキップし、
 * ユーザーの手動割当を絶対に上書きしない）。再実行しても安全。
 *
 * 実行順: このスクリプト → backfill-achievements.ts（永続割当を読んで皆勤賞判定）。
 *
 * 使用方法:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-makeups.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { toJstDateString } from "@/lib/streak";
import { assignMonthMakeups } from "@/lib/achievements/perfectMonth";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  console.log(`対象ユーザー: ${users.length}人`);

  let totalUpdated = 0;
  let skippedUsers = 0;

  for (const user of users) {
    // 手動保護: 既に makeupTargetDay を1件でも持つユーザーは移行済み/手動編集済みとみなしスキップ。
    const already = await prisma.image.findFirst({
      where: { userId: user.id, makeupTargetDay: { not: null } },
      select: { id: true },
    });
    if (already) {
      skippedUsers++;
      continue;
    }

    const images = await prisma.image.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
    });
    if (images.length === 0) continue;

    // 月(ym)ごとに createdAt 昇順の {id, day} 列を作り、月内で貪欲割当。
    const byMonth = new Map<string, { id: string; day: number }[]>();
    for (const img of images) {
      const jst = toJstDateString(img.createdAt); // "YYYY-MM-DD"（JST）
      const ym = jst.slice(0, 7);
      const day = Number(jst.slice(8, 10));
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym)!.push({ id: img.id, day });
    }

    // donorImageId -> holeDay を集めて一括 update。
    const updates: { id: string; holeDay: number }[] = [];
    for (const posts of byMonth.values()) {
      const assigned = assignMonthMakeups(posts); // Map<imageId, holeDay>
      for (const [id, holeDay] of assigned) updates.push({ id, holeDay });
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.image.update({
            where: { id: u.id },
            data: { makeupTargetDay: u.holeDay },
          })
        )
      );
      totalUpdated += updates.length;
      console.log(`  @${user.username}: 穴埋め割当 ${updates.length}件`);
    }
  }

  console.log(
    `完了: 割当書き込み 合計 ${totalUpdated}件 / スキップ(移行済み) ${skippedUsers}人`
  );
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
