/**
 * 「色彩の魔術師」（全8色制覇）まで、あと1色のユーザーをあぶり出す読み取り専用スクリプト。
 * 使い方: DATABASE_URL="postgresql://..." npx tsx scripts/find-one-color-away.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const COLOR_LABELS: Record<string, string> = {
  white: "白",
  red: "赤",
  blue: "青",
  green: "緑",
  yellow: "黄",
  brown: "茶",
  pink: "桃",
  orange: "橙",
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const rows = await prisma.$queryRaw<
    { username: string; instance_id: string; missing_color: string }[]
  >`
    WITH palette(color) AS (
      VALUES ('white'),('red'),('blue'),('green'),('yellow'),('brown'),('pink'),('orange')
    ),
    used AS (
      SELECT user_id, array_agg(DISTINCT color) AS colors
      FROM images
      WHERE season IS NULL AND color IN (SELECT color FROM palette)
      GROUP BY user_id
      HAVING COUNT(DISTINCT color) = 7
    )
    SELECT u.username, u.instance_id, p.color AS missing_color
    FROM used
    JOIN users u ON u.id = used.user_id
    CROSS JOIN palette p
    WHERE p.color <> ALL(used.colors)
    ORDER BY u.username
  `;

  if (rows.length === 0) {
    console.log("あと1色（7色使用済み）のユーザーはいませんでした。");
    return;
  }

  console.log(`あと1色のユーザー: ${rows.length}人\n`);
  for (const r of rows) {
    const label = COLOR_LABELS[r.missing_color] ?? r.missing_color;
    console.log(`${r.username}\t残り: ${label}（${r.missing_color}）\tinstance=${r.instance_id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
