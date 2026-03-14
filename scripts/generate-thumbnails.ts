/**
 * 既存画像のサムネイル一括生成スクリプト
 *
 * 使用方法:
 *   npx tsx scripts/generate-thumbnails.ts
 *
 * 環境変数:
 *   DATABASE_URL: PostgreSQL接続文字列
 *   CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME: R2設定
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

// PrismaClientを初期化（アダプターパターン）
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BATCH_SIZE = 100;
const THUMBNAIL_SIZE = 64;
const THUMBNAIL_QUALITY = 60;

// R2クライアントを初期化
function getR2Client(): S3Client {
  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 configuration is missing");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// R2から画像を取得
async function getImage(client: S3Client, storageKey: string): Promise<Buffer | null> {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("R2_BUCKET_NAME is not configured");
  }

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
      })
    );

    if (!response.Body) {
      return null;
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

// R2に画像をアップロード
async function uploadImage(
  client: S3Client,
  buffer: Buffer,
  storageKey: string,
  contentType: string
): Promise<void> {
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("R2_BUCKET_NAME is not configured");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

// クロップ位置を決定
function getCropPosition(
  position: string,
  width: number,
  height: number,
  size: number
): { left: number; top: number } {
  switch (position) {
    case "bottom":
      return {
        left: 0,
        top: Math.max(0, height - size),
      };
    case "right":
      return {
        left: Math.max(0, width - size),
        top: 0,
      };
    case "top":
    case "left":
    default:
      return {
        left: 0,
        top: 0,
      };
  }
}

// サムネイルを生成
async function generateThumbnail(
  imageBuffer: Buffer,
  position: string
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || THUMBNAIL_SIZE;
  const height = metadata.height || THUMBNAIL_SIZE;
  const cropSize = Math.min(width, height);
  const { left, top } = getCropPosition(position, width, height, cropSize);

  return await sharp(imageBuffer)
    .extract({
      left,
      top,
      width: cropSize,
      height: cropSize,
    })
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();
}

// サムネイルキーを生成
function generateThumbnailKey(storageKey: string): string {
  const lastDot = storageKey.lastIndexOf(".");
  const basePath = lastDot > 0 ? storageKey.substring(0, lastDot) : storageKey;
  return `${basePath}_thumb.webp`;
}

async function main() {
  // --force オプションで全画像を再生成
  const forceRegenerate = process.argv.includes("--force");

  console.log("=== サムネイル一括生成スクリプト ===");
  if (forceRegenerate) {
    console.log("(強制再生成モード)\n");
  } else {
    console.log("(未生成のみ。全て再生成するには --force を付けて実行)\n");
  }

  const r2Client = getR2Client();

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
        // R2から元画像を取得
        const imageBuffer = await getImage(r2Client, image.storageKey);
        if (!imageBuffer) {
          console.log(`  [SKIP] ${image.id}: 元画像が見つかりません`);
          errorCount++;
          processedCount++;
          continue;
        }

        // サムネイルを生成
        const thumbnailKey = generateThumbnailKey(image.storageKey);
        const thumbnailBuffer = await generateThumbnail(imageBuffer, image.position);

        // R2にアップロード
        await uploadImage(r2Client, thumbnailBuffer, thumbnailKey, "image/webp");

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
