/**
 * ユーザー設定保存エンドポイント
 * POST /api/v1/me/preferences - 設定を保存
 * DELETE /api/v1/me/preferences - 設定をリセット
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import {
  isValidPosition,
  isValidFont,
  isValidColor,
  isValidSize,
  isValidOutput,
  isValidArrangement,
} from "@/types";
import { ErrorCodes, errorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401);
    }

    const body = await request.json();

    const { position, font, color, size, output, arrangement } = body;

    // バリデーション（値が指定されている場合のみチェック）
    if (position && !isValidPosition(position)) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "無効な位置です", 400);
    }
    if (font && !isValidFont(font)) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "無効なフォントです", 400);
    }
    if (color && !isValidColor(color)) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "無効な色です", 400);
    }
    if (size && !isValidSize(size)) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "無効なサイズです", 400);
    }
    if (output && !isValidOutput(output)) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "無効な出力形式です", 400);
    }
    if (arrangement && !isValidArrangement(arrangement)) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, "無効なアレンジです", 400);
    }

    // 更新
    await prisma.user.update({
      where: { id: user.id },
      data: {
        defaultPosition: position || null,
        defaultFont: font || null,
        defaultColor: color || null,
        defaultSize: size || null,
        defaultOutput: output || null,
        defaultArrangement: arrangement || null,
      },
    });

    return NextResponse.json({
      success: true,
      preferences: {
        position: position || null,
        font: font || null,
        color: color || null,
        size: size || null,
        output: output || null,
        arrangement: arrangement || null,
      },
    });
  } catch (error) {
    console.error("Failed to save preferences:", error);
    return errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      "設定の保存に失敗しました",
      500
    );
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        defaultPosition: null,
        defaultFont: null,
        defaultColor: null,
        defaultSize: null,
        defaultOutput: null,
        defaultArrangement: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reset preferences:", error);
    return errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      "設定のリセットに失敗しました",
      500
    );
  }
}
