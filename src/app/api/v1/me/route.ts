/**
 * プロフィール取得エンドポイント
 * GET /api/v1/me
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const sessionUser = await getCurrentUser();

    if (!sessionUser) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // preferencesを含むユーザー情報を取得
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        emailPrefix: true,
        defaultPosition: true,
        defaultFont: true,
        defaultColor: true,
        defaultSize: true,
        defaultOutput: true,
        defaultArrangement: true,
        instance: {
          select: {
            domain: true,
            type: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailPrefix: user.emailPrefix,
      instance: {
        domain: user.instance.domain,
        type: user.instance.type,
      },
      preferences: {
        position: user.defaultPosition,
        font: user.defaultFont,
        color: user.defaultColor,
        size: user.defaultSize,
        output: user.defaultOutput,
        arrangement: user.defaultArrangement,
      },
    });
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return NextResponse.json(
      { error: "プロフィールの取得に失敗しました" },
      { status: 500 }
    );
  }
}
