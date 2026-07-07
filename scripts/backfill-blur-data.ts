/**
 * 既存画像の Blurプレースホルダ（LQIP）一括生成スクリプト
 *
 * 使用方法:
 *   npx tsx scripts/backfill-blur-data.ts
 *   npx tsx scripts/backfill-blur-data.ts --force   # 全画像を再生成
 *
 * 環境変数:
 *   DATABASE_URL: PostgreSQL接続文字列
 *   S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME: S3互換ストレージ設定
 *     (R2_* / CF_ACCOUNT_ID も後方互換でフォールバック)
 *
 * 冪等。原本を読み取り 32px の WebP data URI を生成して Image.blurDataUrl に保存するだけ
 * （画像の再アップロードはしない）。sharp が動く環境で実行する。
 */

import dotenv from "dotenv";
// `dotenv/config` は .env しか読まないが、このプロジェクトの env は Next.js 規約の .env.local。
// .env.local を優先で読み、無ければ .env にフォールバックする（DB接続＋ストレージ認証の両方に必要）。
dotenv.config({ path: ".env.local" });
dotenv.config();
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import sharp from "sharp";
import { getImage } from "@/lib/storage/storage";
import { computeBlurDataUrl } from "@/lib/blurData";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BATCH_SIZE = 100;

async function main() {
  const forceRegenerate = process.argv.includes("--force");

  console.log("=== Blurプレースホルダ(LQIP) 一括生成スクリプト ===");
  console.log(
    forceRegenerate
      ? "(強制再生成モード)\n"
      : "(未生成のみ。全て再生成するには --force を付けて実行)\n"
  );

  const whereCondition = forceRegenerate ? {} : { blurDataUrl: null };
  const totalCount = await prisma.image.count({ where: whereCondition });

  console.log(`処理対象: ${totalCount}件\n`);
  if (totalCount === 0) {
    console.log("処理対象の画像がありません。");
    return;
  }

  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let cursor: string | undefined;

  while (processedCount < totalCount) {
    const images = await prisma.image.findMany({
      where: whereCondition,
      take: BATCH_SIZE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: "asc" },
      select: { id: true, storageKey: true },
    });

    if (images.length === 0) break;
    cursor = images[images.length - 1].id;

    for (const image of images) {
      try {
        const imageBuffer = await getImage(image.storageKey);
        if (!imageBuffer) {
          console.log(`  [SKIP] ${image.id}: 元画像が見つかりません`);
          errorCount++;
          processedCount++;
          continue;
        }

        const blurDataUrl = await computeBlurDataUrl(sharp, imageBuffer);
        if (!blurDataUrl) {
          console.log(`  [SKIP] ${image.id}: LQIP 生成に失敗`);
          errorCount++;
          processedCount++;
          continue;
        }

        await prisma.image.update({
          where: { id: image.id },
          data: { blurDataUrl },
        });

        successCount++;
        processedCount++;

        if (processedCount % 10 === 0) {
          console.log(
            `  進捗: ${processedCount}/${totalCount} (成功: ${successCount}, エラー: ${errorCount})`
          );
        }
      } catch (error) {
        console.error(`  [ERROR] ${image.id}:`, error);
        errorCount++;
        processedCount++;
      }
    }
  }

  console.log("\n=== 完了 ===");
  console.log(`  処理済み: ${processedCount}件`);
  console.log(`  成功: ${successCount}件`);
  console.log(`  エラー: ${errorCount}件`);
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
