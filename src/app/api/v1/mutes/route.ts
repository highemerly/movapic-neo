/**
 * ユーザーミュートのエンドポイント
 * POST   /api/v1/mutes - ミュート作成（期間指定・既存があれば期間を更新）
 * DELETE /api/v1/mutes - ミュート解除
 *
 * 相手には通知しない（片方向・秘匿）。ミュートは画像詳細/設定から作成でき、
 * 解除は設定ページからのみ行う想定だが、API上はどちらの起点でも同じ契約で扱う。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import { parseUserHandle } from "@/lib/userHandle";
import { durationToExpiresAt, isMuteDuration } from "@/lib/mutes";

/**
 * body の handle（`username` or `username@domain`）または mutedUserId から対象ユーザーを解決する。
 * どちらも無ければ null（呼び出し側で 400）。見つからなければ notFound。
 */
async function resolveTarget(
  body: { handle?: unknown; mutedUserId?: unknown }
): Promise<{ id: string } | "invalid" | "notFound"> {
  if (typeof body.mutedUserId === "string" && body.mutedUserId) {
    const user = await prisma.user.findUnique({
      where: { id: body.mutedUserId },
      select: { id: true },
    });
    return user ?? "notFound";
  }
  if (typeof body.handle === "string" && body.handle.trim()) {
    const { username, domain } = parseUserHandle(body.handle.trim());
    const user = await prisma.user.findFirst({
      where: { username, instance: { domain } },
      select: { id: true },
    });
    return user ?? "notFound";
  }
  return "invalid";
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
        suggestion: "ログインしてください",
      });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "リクエストが不正です", 400);
    }

    if (!isMuteDuration(body.duration)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "ミュート期間の指定が不正です",
        400
      );
    }

    const target = await resolveTarget(body);
    if (target === "invalid") {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "ミュート対象の指定がありません",
        400
      );
    }
    if (target === "notFound") {
      return errorResponse(ErrorCodes.NOT_FOUND, "ユーザーが見つかりません", 404);
    }

    if (target.id === currentUser.id) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "自分自身はミュートできません",
        400
      );
    }

    const expiresAt = durationToExpiresAt(body.duration);

    // 再ミュートは期間の付け替え。@@unique([muterId, mutedUserId]) を使った upsert。
    await prisma.mute.upsert({
      where: {
        muterId_mutedUserId: {
          muterId: currentUser.id,
          mutedUserId: target.id,
        },
      },
      create: {
        muterId: currentUser.id,
        mutedUserId: target.id,
        expiresAt,
      },
      update: { expiresAt },
    });

    return NextResponse.json({
      success: true,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
        suggestion: "ログインしてください",
      });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "リクエストが不正です", 400);
    }

    const target = await resolveTarget(body);
    if (target === "invalid") {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "解除対象の指定がありません",
        400
      );
    }
    if (target === "notFound") {
      return errorResponse(ErrorCodes.NOT_FOUND, "ユーザーが見つかりません", 404);
    }

    // 対象を絞った deleteMany（存在しなくても count=0 で冪等）。
    await prisma.mute.deleteMany({
      where: { muterId: currentUser.id, mutedUserId: target.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUnknownError(error);
  }
}
