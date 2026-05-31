/**
 * Mastodonお気に入り連携・移行スクリプト（1回限り、冪等）
 *
 * 1. postIdバックフィル: postUrl（例: https://handon.club/@user/109364261799600716）
 *    の末尾の数値がオーナーインスタンス上のMastodon status ID。正規表現抽出のみで
 *    Mastodon APIへのアクセスは不要。
 * 2. 旧お気に入りカウントのクリア: 旧・独自お気に入り機能時代の `favoriteCount` が
 *    お気に入り対象外（非Mastodon投稿）の画像に残っているとTL等に表示され続けるため、
 *    対象外画像のカウントを0にリセットする。
 *
 * 使用方法:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-post-id.ts
 *
 * postIdバックフィル対象外（postIdはnullのまま = お気に入り無効）:
 *   - postUrlがnull（local投稿・投稿失敗・postUrl導入前の古い投稿）
 *   - Misskey（/notes/xxx のように末尾が数値でない）
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// postUrl末尾の数値（Mastodon status ID）を抽出
function extractPostId(postUrl: string): string | null {
  const match = postUrl.match(/\/(\d+)\/?$/);
  return match ? match[1] : null;
}

async function backfillPostId() {
  const images = await prisma.image.findMany({
    where: { postId: null, postUrl: { not: null } },
    select: { id: true, postUrl: true },
  });

  console.log(`[postId] 対象画像: ${images.length}件`);

  let updated = 0;
  let skipped = 0;
  for (const image of images) {
    const postId = extractPostId(image.postUrl!);
    if (!postId) {
      skipped++;
      continue;
    }
    await prisma.image.update({
      where: { id: image.id },
      data: { postId },
    });
    updated++;
  }

  console.log(`[postId] 完了: ${updated}件更新, ${skipped}件スキップ（数値ID抽出不可）`);
}

// 旧・独自お気に入り機能時代の favoriteCount が残っている、お気に入り対象外
// （非Mastodon投稿）の画像のカウントを0にリセット。冪等：既に0なら更新されない
async function resetStaleFavoriteCounts() {
  const result = await prisma.image.updateMany({
    where: {
      favoriteCount: { gt: 0 },
      OR: [
        { postId: null },
        { user: { instance: { type: { not: "mastodon" } } } },
      ],
    },
    data: { favoriteCount: 0 },
  });
  console.log(`[favoriteCount] 旧カウントをリセット: ${result.count}件`);
}

async function main() {
  await backfillPostId();
  await resetStaleFavoriteCounts();
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
