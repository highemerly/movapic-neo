/**
 * S3互換ストレージクライアント
 *
 * S3_* 環境変数を優先し、未設定の場合は従来の R2_* / CF_ACCOUNT_ID にフォールバックする。
 * 対応: Cloudflare R2 / AWS S3 / その他のS3互換ストレージ。
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

let s3Client: S3Client | null = null;

function resolveEndpoint(): string {
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    return endpoint;
  }
  // R2 フォールバック: CF_ACCOUNT_ID からエンドポイントを構築
  const accountId = process.env.CF_ACCOUNT_ID;
  if (accountId) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }
  throw new Error("S3_ENDPOINT (or CF_ACCOUNT_ID for R2) is not configured");
}

function resolveBucketName(): string {
  const bucketName = process.env.S3_BUCKET_NAME ?? process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME is not configured");
  }
  return bucketName;
}

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION ?? "auto";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("S3 credentials are not configured");
  }

  s3Client = new S3Client({
    region,
    endpoint: resolveEndpoint(),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3Client;
}

/**
 * ストレージキーを生成
 * フォーマット: {year}/{month}/{day}/{imageId}.{ext}
 */
export function generateStorageKey(imageId: string, extension: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `${year}/${month}/${day}/${imageId}.${extension}`;
}

/**
 * サムネイル用のストレージキーを生成（元キーから派生・純粋な文字列処理）
 * 例: 2025/03/14/uuid.jpg → 2025/03/14/uuid_thumb.webp
 *
 * sharp に依存しないよう thumbnail.ts ではなくここに置く（worker-front は本関数のみ使う）。
 */
export function generateThumbnailKey(storageKey: string): string {
  const lastDot = storageKey.lastIndexOf(".");
  const basePath = lastDot > 0 ? storageKey.substring(0, lastDot) : storageKey;
  return `${basePath}_thumb.webp`;
}

/**
 * 末尾スラッシュを正規化した公開URLのベース部分を取得
 */
export function getPublicUrlBase(): string {
  const publicUrl = process.env.S3_PUBLIC_URL ?? process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error("S3_PUBLIC_URL is not configured");
  }
  return publicUrl.replace(/\/+$/, "");
}

/**
 * ストレージキーから公開URLを生成
 */
export function getPublicUrl(storageKey: string): string {
  return `${getPublicUrlBase()}/${storageKey}`;
}

/**
 * 画像をストレージにアップロード
 */
export async function uploadImage(
  buffer: Buffer,
  storageKey: string,
  contentType: string
): Promise<void> {
  const client = getS3Client();
  const bucketName = resolveBucketName();

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

/**
 * 画像をストレージから削除
 */
export async function deleteImage(storageKey: string): Promise<void> {
  const client = getS3Client();
  const bucketName = resolveBucketName();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    })
  );
}

/**
 * 画像をストレージから取得
 */
export async function getImage(storageKey: string): Promise<Buffer | null> {
  const client = getS3Client();
  const bucketName = resolveBucketName();

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

/**
 * MIMEタイプから拡張子を取得
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return mimeToExt[mimeType] || "jpg";
}
