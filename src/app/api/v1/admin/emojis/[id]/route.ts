/**
 * 管理者用: SHAMEZO 独自カスタム絵文字の更新・削除
 * PATCH  /api/v1/admin/emojis/:id   … enabled の切り替え（soft-disable）
 * DELETE /api/v1/admin/emojis/:id   … 未使用なら実体ごと削除
 *
 * 使用済み（Reaction テーブルにそのキーが残っている）絵文字を消すとチップの画像が壊れるため、
 * ハード削除は未使用のものだけに限る。使用中は enabled=false（soft-disable）で隠す。
 * 管理者以外には存在を隠すため 404 を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import { deleteImage } from "@/lib/storage/storage";
import {
  invalidateShamezoEmojiCatalog,
} from "@/lib/reactions/customEmoji";
import { shamezoEmojiKey } from "@/lib/reactions/emojiKey";
import { isRequestAdmin } from "../shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isRequestAdmin())) {
      return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
    }
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== "boolean") {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "enabled を指定してください", 400);
    }

    const updated = await prisma.customEmoji
      .update({ where: { id }, data: { enabled: body.enabled }, select: { id: true } })
      .catch(() => null);
    if (!updated) {
      return errorResponse(ErrorCodes.NOT_FOUND, "絵文字が見つかりません", 404);
    }
    invalidateShamezoEmojiCatalog();
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUnknownError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isRequestAdmin())) {
      return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
    }
    const { id } = await params;
    const emoji = await prisma.customEmoji.findUnique({
      where: { id },
      select: { name: true, storageKey: true },
    });
    if (!emoji) {
      return errorResponse(ErrorCodes.NOT_FOUND, "絵文字が見つかりません", 404);
    }

    // 使用済みなら消すとチップが壊れるため、無効化を促す（soft-disable）。
    const usedCount = await prisma.reaction.count({
      where: { emoji: shamezoEmojiKey(emoji.name) },
    });
    if (usedCount > 0) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "既にリアクションで使われているため削除できません。無効化してください",
        400
      );
    }

    // ストレージ実体は best-effort（消えても DB を正とする）。DB を削除してから消す。
    await prisma.customEmoji.delete({ where: { id } });
    invalidateShamezoEmojiCatalog();
    try {
      await deleteImage(emoji.storageKey);
    } catch (error) {
      console.error(`[emoji] failed to delete storage object: ${emoji.storageKey}`, error);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUnknownError(error);
  }
}
