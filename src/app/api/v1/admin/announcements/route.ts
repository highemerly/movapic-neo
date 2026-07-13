/**
 * 管理者によるお知らせ作成エンドポイント
 * POST /api/v1/admin/announcements
 *
 * body: { type, message, detail?, publishAt, pinnedUntil? }
 * 作成後に revalidateTag("announcements") でキャッシュを破棄し即時反映する。
 * 管理者以外には存在を隠すため 404 を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/db";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import { ANNOUNCEMENTS_TAG } from "@/lib/announcements";
import { isRequestAdmin, parseAnnouncementInput } from "./shared";

export async function POST(request: NextRequest) {
  try {
    if (!(await isRequestAdmin())) {
      return errorResponse(ErrorCodes.NOT_FOUND, "見つかりません", 404);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = parseAnnouncementInput(body);
    if ("error" in parsed) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, parsed.error, 400);
    }

    const created = await prisma.announcement.create({ data: parsed.data });
    revalidateTag(ANNOUNCEMENTS_TAG, "max");

    return NextResponse.json({ success: true, id: created.id });
  } catch (error) {
    return handleUnknownError(error);
  }
}
