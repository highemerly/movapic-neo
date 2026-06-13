/**
 * dev用: highemerly の 2026年6月にダミー投稿を入れる（皆勤賞・穴埋めUIの確認用）。
 * 直接 image.create するので実績評価・通知は走らない（必要なら backfill を別途実行）。
 *   DATABASE_URL=... npx tsx scripts/dev-seed-june.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const USERNAME = "highemerly";
const DAYS = [6, 7, 8, 10, 12]; // 2026年6月（JST）

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const user = await prisma.user.findFirst({
    where: { username: USERNAME },
    select: { id: true },
  });
  if (!user) throw new Error(`user @${USERNAME} not found`);

  // サムネが表示されるよう、既存画像の thumbnailKey / 寸法を流用（無ければプレースホルダ）。
  const sample = await prisma.image.findFirst({
    where: { userId: user.id, thumbnailKey: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { thumbnailKey: true, storageKey: true, width: true, height: true },
  });
  const thumbnailKey = sample?.thumbnailKey ?? null;
  const width = sample?.width ?? 800;
  const height = sample?.height ?? 600;

  for (const day of DAYS) {
    // JST正午 = UTC 03:00。toJstDateString が "2026-06-DD" になる。
    const createdAt = new Date(Date.UTC(2026, 5, day, 3, 0, 0));
    await prisma.image.create({
      data: {
        userId: user.id,
        storageKey: `dev-dummy/2026-06/${String(day).padStart(2, "0")}-${randomUUID()}`,
        thumbnailKey,
        filename: `dummy-06${String(day).padStart(2, "0")}.jpg`,
        mimeType: "image/jpeg",
        fileSize: 123456,
        width,
        height,
        overlayText: `テスト投稿 6/${day}`,
        position: "top",
        font: "hui-font",
        color: "white",
        size: "medium",
        outputFormat: "none",
        source: "web",
        isPublic: true,
        createdAt,
      },
    });
    console.log(`  + 6/${day} (createdAt=${createdAt.toISOString()})`);
  }
  const total = await prisma.image.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.UTC(2026, 5, 1, -9)), lt: new Date(Date.UTC(2026, 6, 1, -9)) },
    },
  });
  console.log(`完了: @${USERNAME} の6月の投稿数(累計) = ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
