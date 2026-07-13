/**
 * 管理者によるお知らせ更新・削除エンドポイント
 * PATCH  /api/v1/admin/announcements/:id  … 内容を更新
 * DELETE /api/v1/admin/announcements/:id  … 削除
 *
 * いずれも成功後に revalidateTag("announcements") でキャッシュを破棄し即時反映する。
 * 管理者以外には存在を隠すため 404 を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import { ANNOUNCEMENTS_TAG } from "@/lib/announcements";
import { isRequestAdmin, parseAnnouncementInput } from "../shared";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isRequestAdmin())) {
      return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
    }

    const id = parseId((await params).id);
    if (id === null) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "id が不正です", 400);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parseAnnouncementInput(body);
    if ("error" in parsed) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, parsed.error, 400);
    }

    try {
      await prisma.announcement.update({ where: { id }, data: parsed.data });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
      }
      throw e;
    }

    revalidateTag(ANNOUNCEMENTS_TAG, "max");
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

    const id = parseId((await params).id);
    if (id === null) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "id が不正です", 400);
    }

    try {
      await prisma.announcement.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      ) {
        return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
      }
      throw e;
    }

    revalidateTag(ANNOUNCEMENTS_TAG, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUnknownError(error);
  }
}
