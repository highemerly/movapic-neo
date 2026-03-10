/**
 * Cloudflare R2 ストレージクライアント
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (r2Client) {
    return r2Client;
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 configuration is missing");
  }

  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return r2Client;
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
 * ストレージキーから公開URLを生成
 */
export function getPublicUrl(storageKey: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error("R2_PUBLIC_URL is not configured");
  }
  // 末尾スラッシュを削除して正規化
  const normalizedUrl = publicUrl.replace(/\/+$/, "");
  return `${normalizedUrl}/${storageKey}`;
}

/**
 * 画像をR2にアップロード
 */
export async function uploadImage(
  buffer: Buffer,
  storageKey: string,
  contentType: string
): Promise<void> {
  const client = getR2Client();
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

/**
 * 画像をR2から削除
 */
export async function deleteImage(storageKey: string): Promise<void> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!bucketName) {
    throw new Error("R2_BUCKET_NAME is not configured");
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    })
  );
}

/**
 * 画像をR2から取得
 */
export async function getImage(storageKey: string): Promise<Buffer | null> {
  const client = getR2Client();
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
