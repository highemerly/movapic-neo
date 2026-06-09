/**
 * メール投稿処理エンドポイント
 * POST /api/v1/email-generate
 *
 * Cloudflare Workerから転送されたraw emailを処理
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { parseEmail } from "@/lib/email/parser";
import { uploadImage } from "@/lib/storage/storage";
import { enqueueEmail } from "@/lib/queue";
import { verifyRequestSignature, hashRequestBody } from "@/lib/auth/crypto";
import prisma from "@/lib/db";
import { MAX_TEXT_LENGTH, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@/types";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";

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

    // 元画像を R2 一時領域へ保存し、文字入れ〜投稿は worker に委譲する（producer は受付のみ）。
    const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
    const sourceStorageKey = `tmp/email/${randomUUID()}.${ext}`;
    await uploadImage(parsed.image.buffer, sourceStorageKey, parsed.image.contentType);

    await enqueueEmail({
      userId: user.id,
      text: parsed.text,
      options: {
        position: parsed.options.position,
        font: parsed.options.font,
        color: parsed.options.color,
        size: parsed.options.size,
        arrangement: parsed.options.arrangement,
      },
      sourceStorageKey,
      sourceContentType: parsed.image.contentType,
    });

    return NextResponse.json({ success: true, queued: true }, { status: 202 });
  } catch (error) {
    return handleUnknownError(error, requestId);
  }
}
