/**
 * 管理者用: SHAMEZO 独自カスタム絵文字の一覧取得・登録
 * GET  /api/v1/admin/emojis        … 全件（無効含む）を管理用に返す
 * POST /api/v1/admin/emojis        … multipart/form-data で画像を登録
 *
 * 画像はメディアプロキシを通さず自前ストレージへ原本保存し、そのまま直接配信する
 * （プロキシの再エンコードでアニメーション(APNG/GIF)が潰れるのを避ける。docs/favorite.md 参照）。
 * 管理者以外には存在を隠すため 404 を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getPublicUrl,
  uploadImage,
} from "@/lib/storage/storage";
import {
  ALLOWED_EMOJI_MIME_TYPES,
  MAX_EMOJI_FILE_SIZE,
  emojiExtensionFromMimeType,
  invalidateShamezoEmojiCatalog,
  isAllowedEmojiMimeType,
} from "@/lib/reactions/customEmoji";
import {
  isRequestAdmin,
  parseAliases,
  parseCategory,
  parseLicense,
  validateEmojiName,
} from "./shared";

export async function GET() {
  try {
    if (!(await isRequestAdmin())) {
      return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
    }
    const emojis = await prisma.customEmoji.findMany({
      orderBy: [{ enabled: "desc" }, { category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        imageUrl: true,
        category: true,
        aliases: true,
        license: true,
        enabled: true,
        createdById: true,
        createdAt: true,
      },
    });
    return NextResponse.json(
      {
        success: true,
        emojis: emojis.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleUnknownError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!(await isRequestAdmin())) {
      return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "リクエストが不正です", 400);
    }

    const nameResult = validateEmojiName(form.get("name"));
    if ("error" in nameResult) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, nameResult.error, 400);
    }
    const { name } = nameResult;
    const category = parseCategory(form.get("category"));
    const aliases = parseAliases(form.get("aliases"));
    const license = parseLicense(form.get("license"));

    const blob = form.get("image");
    if (!(blob instanceof Blob) || blob.size === 0) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "画像を指定してください", 400);
    }
    if (!isAllowedEmojiMimeType(blob.type)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        `対応形式は ${ALLOWED_EMOJI_MIME_TYPES.join(" / ")} です`,
        400
      );
    }
    if (blob.size > MAX_EMOJI_FILE_SIZE) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        `ファイルサイズが${MAX_EMOJI_FILE_SIZE / 1024 / 1024}MBを超えています`,
        400
      );
    }

    // 名前は内部キーになるため重複不可（DB unique だが分かりやすいエラーのため先に確認）
    const existing = await prisma.customEmoji.findUnique({ where: { name } });
    if (existing) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "同じ名前の絵文字が既にあります", 400);
    }

    // APNG は png コンテナ。ブラウザでアニメーション再生させるため image/png で配信する
    const contentType = blob.type === "image/apng" ? "image/png" : blob.type;
    const ext = emojiExtensionFromMimeType(blob.type);
    const storageKey = `emoji/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await blob.arrayBuffer());
    await uploadImage(buffer, storageKey, contentType);

    const created = await prisma.customEmoji.create({
      data: {
        name,
        imageUrl: getPublicUrl(storageKey),
        storageKey,
        category,
        aliases,
        license,
        createdById: currentUser?.id ?? null,
      },
      select: { id: true },
    });
    invalidateShamezoEmojiCatalog();

    return NextResponse.json({ success: true, id: created.id });
  } catch (error) {
    return handleUnknownError(error);
  }
}
