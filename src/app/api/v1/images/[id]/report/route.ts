/**
 * 通報エンドポイント
 * POST /api/v1/images/:id/report - 画像を通報する
 *
 * ログインユーザーなら誰でも通報可能（自分の画像は不可）。
 * 通報直後は画像に何も起きない。管理者が /admin/reports で対応したときのみ変化する。
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import { enqueueReportNotification } from "@/lib/queue";

const REASON_MIN = 2;
const REASON_MAX = 100;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
        suggestion: "ログインしてください",
      });
    }

    const { id: imageId } = await params;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        `通報理由は${REASON_MIN}〜${REASON_MAX}文字で入力してください`,
        400
      );
    }

    const image = await prisma.image.findUnique({
      where: { id: imageId },
      select: { userId: true },
    });

    if (!image) {
      return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
    }

    // 自分の画像は通報できない
    if (image.userId === currentUser.id) {
      return errorResponse(
        ErrorCodes.FORBIDDEN,
        "自分の画像は通報できません",
        403
      );
    }

    let reportId: string;
    try {
      const report = await prisma.report.create({
        data: { imageId, reporterId: currentUser.id, reason },
        select: { id: true },
      });
      reportId = report.id;
    } catch (error) {
      // 同一ユーザーが同一画像を二重通報（@@unique 違反）→ 既に受付済みとして成功扱い
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json({ success: true, alreadyReported: true });
      }
      throw error;
    }

    // 管理者へ Bot 通知（失敗しても通報自体は成功扱い）
    try {
      await enqueueReportNotification({ reportId });
    } catch (error) {
      console.error("[report] 通知ジョブの enqueue に失敗:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUnknownError(error);
  }
}
