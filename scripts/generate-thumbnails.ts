/**
 * 既存画像のサムネイル一括生成スクリプト
 *
 * 使用方法:
 *   npx tsx scripts/generate-thumbnails.ts
 *
 * 環境変数:
 *   DATABASE_URL: PostgreSQL接続文字列
 *   S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME: S3互換ストレージ設定
 *     (R2_* / CF_ACCOUNT_ID も後方互換でフォールバック)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  getImage,
  uploadImage,
  generateThumbnailKey,
} from "@/lib/storage/storage";
import { generateThumbnail } from "@/lib/thumbnail";
import { Position } from "@/types";

// PrismaClientを初期化（アダプターパターン）
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BATCH_SIZE = 100;

async function main() {
  // --force オプションで全画像を再生成
  const forceRegenerate = process.argv.includes("--force");

  console.log("=== サムネイル一括生成スクリプト ===");
  if (forceRegenerate) {
    console.log("(強制再生成モード)\n");
  } else {
    console.log("(未生成のみ。全て再生成するには --force を付けて実行)\n");
  }

  // 対象画像をカウント
  const whereCondition = forceRegenerate ? {} : { thumbnailKey: null };
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

  // バッチ処理
  while (processedCount < totalCount) {
    const images = await prisma.image.findMany({
      where: whereCondition,
      take: BATCH_SIZE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: "asc" },
      select: {
        id: true,
        storageKey: true,
        position: true,
      },
    });

    if (images.length === 0) {
      break;
    }

    // 次のバッチ用にカーソルを更新
    cursor = images[images.length - 1].id;

    for (const image of images) {
      try {
        // ストレージから元画像を取得
        const imageBuffer = await getImage(image.storageKey);
        if (!imageBuffer) {
          console.log(`  [SKIP] ${image.id}: 元画像が見つかりません`);
          errorCount++;
          processedCount++;
          continue;
        }

        // サムネイルを生成
        const thumbnailKey = generateThumbnailKey(image.storageKey);
        const thumbnailBuffer = await generateThumbnail(
          imageBuffer,
          image.position as Position
        );

        // ストレージにアップロード
        await uploadImage(thumbnailBuffer, thumbnailKey, "image/webp");

        // DBを更新
        await prisma.image.update({
          where: { id: image.id },
          data: { thumbnailKey },
        });

        successCount++;
        processedCount++;

        if (processedCount % 10 === 0) {
          console.log(`  進捗: ${processedCount}/${totalCount} (成功: ${successCount}, エラー: ${errorCount})`);
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
