/**
 * プロフィール取得・更新エンドポイント
 * GET /api/v1/me
 * PATCH /api/v1/me
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

/**
 * HTMLタグと制御文字を除去してサニタイズ
 */
function sanitizeBio(input: string): string {
  return input
    // HTMLタグを除去
    .replace(/<[^>]*>/g, "")
    // HTMLエンティティをデコードして除去（&lt; &gt; など）
    .replace(/&[a-zA-Z0-9#]+;/g, "")
    // 制御文字を除去（改行・タブは許可しない）
    .replace(/[\x00-\x1F\x7F]/g, "")
    // 前後の空白を除去
    .trim();
}

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
        bio: true,
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
      bio: user.bio,
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

const BIO_MAX_LENGTH = 40;

export async function PATCH(request: NextRequest) {
  try {
    const sessionUser = await getCurrentUser();

    if (!sessionUser) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();

    if (typeof body.bio !== "string") {
      return NextResponse.json(
        { error: "bioは文字列である必要があります" },
        { status: 400 }
      );
    }

    // サニタイズして長さチェック
    const sanitizedBio = sanitizeBio(body.bio);

    if (sanitizedBio.length > BIO_MAX_LENGTH) {
      return NextResponse.json(
        { error: `プロフィールは${BIO_MAX_LENGTH}文字以内で入力してください` },
        { status: 400 }
      );
    }

    // 空文字の場合はnullとして保存
    const bioToSave = sanitizedBio.length === 0 ? null : sanitizedBio;

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { bio: bioToSave },
    });

    return NextResponse.json({ success: true, bio: bioToSave });
  } catch (error) {
    console.error("Failed to update profile:", error);
    return NextResponse.json(
      { error: "プロフィールの更新に失敗しました" },
      { status: 500 }
    );
  }
}
