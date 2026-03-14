/**
 * メール投稿処理エンドポイント
 * POST /api/v1/email-generate
 *
 * Cloudflare Workerから転送されたraw emailを処理
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { parseEmail } from "@/lib/email/parser";
import { processImage } from "@/lib/imageProcessor";
import { uploadImage, generateStorageKey, getExtensionFromMimeType } from "@/lib/storage/r2";
import { generateThumbnail, generateThumbnailKey } from "@/lib/thumbnail";
import { verifyRequestSignature, hashRequestBody } from "@/lib/auth/crypto";
import prisma from "@/lib/db";
import { MAX_TEXT_LENGTH, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@/types";
import {
  ErrorCodes,
  ImageProcessError,
  errorResponse,
  handleImageProcessError,
  handleUnknownError,
} from "@/lib/errors";

// 処理タイムアウト
const PROCESS_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, requestId: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ImageProcessError("タイムアウト", "composite", requestId)), ms)
    ),
  ]);
}

export async function POST(request: NextRequest) {
  const requestId = `email-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    // リクエストボディを取得
    const rawEmail = Buffer.from(await request.arrayBuffer());

    // 内部APIキー検証
    const apiKey = request.headers.get("X-API-Key");
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      return errorResponse(
        ErrorCodes.AUTH_INVALID,
        "認証に失敗しました",
        401,
        { requestId }
      );
    }

    // リクエスト署名検証（HMAC-SHA256）
    const timestamp = request.headers.get("X-Request-Timestamp");
    const signature = request.headers.get("X-Request-Signature");

    if (!timestamp || !signature) {
      return errorResponse(
        ErrorCodes.AUTH_INVALID,
        "署名が不足しています",
        401,
        { requestId }
      );
    }

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
      return errorResponse(
        ErrorCodes.AUTH_INVALID,
        "無効なタイムスタンプです",
        401,
        { requestId }
      );
    }

    const bodyHash = hashRequestBody(rawEmail);
    if (!verifyRequestSignature(ts, bodyHash, signature, process.env.INTERNAL_API_KEY!)) {
      return errorResponse(
        ErrorCodes.AUTH_INVALID,
        "署名の検証に失敗しました",
        401,
        { requestId }
      );
    }

    // emailPrefixを取得
    const emailPrefix = request.headers.get("X-Email-Prefix");
    if (!emailPrefix) {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "メールプレフィックスは必須です",
        400,
        { requestId }
      );
    }

    // ユーザーを検索
    const user = await prisma.user.findUnique({
      where: { emailPrefix },
      include: { instance: true },
    });

    if (!user) {
      return errorResponse(
        ErrorCodes.NOT_FOUND,
        "ユーザーが見つかりません",
        404,
        { requestId }
      );
    }

    // raw emailをパース
    const parsed = await parseEmail(rawEmail);

    // バリデーション
    if (!parsed.image) {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "画像が添付されていません",
        400,
        { requestId }
      );
    }

    if (!parsed.text || parsed.text.trim().length === 0) {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "テキストがありません",
        400,
        { requestId }
      );
    }

    if (parsed.text.length > MAX_TEXT_LENGTH) {
      return errorResponse(
        ErrorCodes.VALIDATION_TOO_LONG,
        `テキストは${MAX_TEXT_LENGTH}文字以下にしてください`,
        400,
        { requestId }
      );
    }

    if (parsed.image.buffer.length > MAX_FILE_SIZE) {
      return errorResponse(
        ErrorCodes.VALIDATION_FILE_TOO_LARGE,
        "画像サイズが大きすぎます",
        400,
        {
          suggestion: "25MB以下の画像を使用してください",
          requestId,
        }
      );
    }

    // ファイルタイプチェック
    const contentType = parsed.image.contentType.toLowerCase();
    const isHEICFile = contentType.includes("heic") || contentType.includes("heif");
    const isValidType = ALLOWED_FILE_TYPES.some((t) => contentType.includes(t.split("/")[1])) || isHEICFile;

    if (!isValidType) {
      return errorResponse(
        ErrorCodes.VALIDATION_FILE_TYPE,
        "対応していない画像形式です",
        400,
        { requestId }
      );
    }

    // 出力形式をインスタンスタイプから決定
    const outputFormat = user.instance.type === "misskey" ? "misskey" : "mastodon";

    // 画像処理
    const result = await withTimeout(
      processImage({
        imageBuffer: parsed.image.buffer,
        text: parsed.text,
        position: parsed.options.position,
        color: parsed.options.color,
        size: parsed.options.size,
        font: parsed.options.font,
        output: outputFormat,
        arrangement: parsed.options.arrangement,
        requestId,
      }),
      PROCESS_TIMEOUT_MS,
      requestId
    );

    // R2にアップロード
    const imageId = randomUUID();
    const extension = getExtensionFromMimeType(result.contentType);
    const storageKey = generateStorageKey(imageId, extension);

    await uploadImage(result.buffer, storageKey, result.contentType);

    // サムネイルを生成してR2にアップロード
    const thumbnailKey = generateThumbnailKey(storageKey);
    const thumbnailBuffer = await generateThumbnail(result.buffer, parsed.options.position);
    await uploadImage(thumbnailBuffer, thumbnailKey, "image/webp");

    // 画像メタデータを取得
    const metadata = await sharp(result.buffer).metadata();

    // DBに保存
    await prisma.image.create({
      data: {
        id: imageId,
        userId: user.id,
        storageKey,
        filename: `movapic-${imageId}.${extension}`,
        mimeType: result.contentType,
        fileSize: result.buffer.length,
        width: metadata.width || 0,
        height: metadata.height || 0,
        overlayText: parsed.text,
        position: parsed.options.position,
        font: parsed.options.font,
        color: parsed.options.color,
        size: parsed.options.size,
        outputFormat,
        arrangement: parsed.options.arrangement,
        thumbnailKey,
        source: "email",
        isPublic: true,
      },
    });

    return NextResponse.json({
      success: true,
      imageId,
      storageKey,
    });
  } catch (error) {
    // 画像処理エラー（ステージ別）
    if (error instanceof ImageProcessError) {
      console.error(`[email-generate] rid=${requestId} IMAGE_PROCESS_ERROR: stage=${error.stage}, message=${error.message}`);
      return handleImageProcessError(error);
    }

    return handleUnknownError(error, requestId);
  }
}
