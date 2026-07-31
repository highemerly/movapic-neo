/**
 * S3互換ストレージクライアント
 *
 * S3_* 環境変数で設定する（AWS S3 / MinIO などのS3互換ストレージ）。
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

let s3Client: S3Client | null = null;

// HTTPタイムアウト。
// pitfall: AWS SDK v3 の既定は connectionTimeout / requestTimeout / socketTimeout すべて 0＝無効。
// keep-alive で再利用したソケットを相手側やNATが黙って捨てていると、リクエストを投げたまま
// 永久に応答を待ち続け、エラーにもならないのでSDKのリトライも走らない（＝呼び出し元の
// await が解決しない）。カレンダー画像生成のように1リクエストで最大31本のGETを並列発行する
// 経路では、1本刺さるだけで Promise.all が固まりHTTPレスポンスが永遠に返らなくなる。
// TimeoutError は SDK の TRANSIENT_ERROR_CODES に含まれるため、上限に達すれば新しい接続で
// 自動リトライされる。
// 実測のヘッダ受信は 25〜140ms。下の値はその数十倍で、正常系を切らずに異常だけ落とす幅。
const S3_TIMEOUTS = {
  // 新規接続の確立（TCP+TLS）まで。
  connectionTimeout: 2000,
  // 1試行あたりのリクエスト送信〜レスポンスヘッダ受信まで。
  // 超過は TimeoutError＝SDK の TRANSIENT_ERROR_CODES なので、新しい接続で自動リトライされる。
  requestTimeout: 4000,
  // これが無いと requestTimeout 超過は警告ログだけで、実際には待ち続ける。
  throwOnRequestTimeout: true,
} as const;

// アップロードだけは requestTimeout に本文送信が含まれるので、送信ごとに上書きして長めに取る
// （数MBの画像を載せるため、ヘッダ待ちと同じ尺では足りない）。
const S3_PUT_TIMEOUT_MS = 15000;

// GET の「送信〜本文読み切り」全体（リトライ込み）の上限。
// pitfall: 上記 requestTimeout / socketTimeout は **レスポンスヘッダ受信時点で全て解除される**
// （NodeHttpHandler が resolve 時に clearTimeouts する）ため、ヘッダだけ返って本文が永久に
// 来ないオブジェクトを掴むと await が解けない。実際に「HEADは成功しContentLengthも返るのに
// GETの本文が来ない」壊れたサムネが検証環境にあり、カレンダー画像生成が無応答になった。
// AbortSignal は本文ストリーミング中も有効なので、取得操作全体の上限にはこちらを使う。
const S3_GET_TIMEOUT_MS = 10000;

function resolveEndpoint(): string {
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    return endpoint;
  }
  throw new Error("S3_ENDPOINT is not configured");
}

function resolveBucketName(): string {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME is not configured");
  }
  return bucketName;
}

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
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
    requestHandler: S3_TIMEOUTS,
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
  const publicUrl = process.env.S3_PUBLIC_URL;
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
    }),
    { requestTimeout: S3_PUT_TIMEOUT_MS }
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
      }),
      { abortSignal: AbortSignal.timeout(S3_GET_TIMEOUT_MS) }
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
 * 指定プレフィックス配下で、最終更新（LastModified）から maxAgeMs を超えたオブジェクトの
 * キー一覧を返す。tmp/* 一時領域の定期クリーンアップ用。
 * ページングに対応する（IsTruncated を辿って全件走査）。
 */
export async function listExpiredObjects(
  prefix: string,
  maxAgeMs: number
): Promise<string[]> {
  const client = getS3Client();
  const bucketName = resolveBucketName();
  const cutoff = Date.now() - maxAgeMs;

  const expired: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of response.Contents ?? []) {
      // ディレクトリプレースホルダ（キー末尾が "/"）は除外
      if (!obj.Key || obj.Key.endsWith("/")) continue;
      if (obj.LastModified && obj.LastModified.getTime() < cutoff) {
        expired.push(obj.Key);
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return expired;
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
