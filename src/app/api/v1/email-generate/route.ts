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
import prisma from "@/lib/db";
import { MAX_TEXT_LENGTH, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@/types";

// 処理タイムアウト
const PROCESS_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

export async function POST(request: NextRequest) {
  try {
    // 内部APIキー検証
    const apiKey = request.headers.get("X-API-Key");
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // emailPrefixを取得
    const emailPrefix = request.headers.get("X-Email-Prefix");
    if (!emailPrefix) {
      return NextResponse.json({ error: "Email prefix required" }, { status: 400 });
    }

    // ユーザーを検索
    const user = await prisma.user.findUnique({
      where: { emailPrefix },
      include: { instance: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // raw emailを取得してパース
    const rawEmail = Buffer.from(await request.arrayBuffer());
    const parsed = await parseEmail(rawEmail);

    // バリデーション
    if (!parsed.image) {
      return NextResponse.json({ error: "No image attachment" }, { status: 400 });
    }

    if (!parsed.text || parsed.text.trim().length === 0) {
      return NextResponse.json({ error: "No text content" }, { status: 400 });
    }

    if (parsed.text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text must be ${MAX_TEXT_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    if (parsed.image.buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }

    // ファイルタイプチェック
    const contentType = parsed.image.contentType.toLowerCase();
    const isHEIC = contentType.includes("heic") || contentType.includes("heif");
    const isValidType = ALLOWED_FILE_TYPES.some((t) => contentType.includes(t.split("/")[1])) || isHEIC;

    if (!isValidType) {
      return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
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
        isHEIC,
      }),
      PROCESS_TIMEOUT_MS
    );

    // R2にアップロード
    const imageId = randomUUID();
    const extension = getExtensionFromMimeType(result.contentType);
    const storageKey = generateStorageKey(imageId, extension);

    await uploadImage(result.buffer, storageKey, result.contentType);

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
    console.error("Email generate error:", error);

    if (error instanceof Error && error.message === "Timeout") {
      return NextResponse.json({ error: "Processing timeout" }, { status: 504 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
