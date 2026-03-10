/**
 * メールアドレスプレフィックス再生成エンドポイント
 * POST /api/v1/me/email-prefix
 */

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

export async function POST() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 新しいemailPrefixを生成
    const newEmailPrefix = nanoid(16);

    // DBを更新
    await prisma.user.update({
      where: { id: user.id },
      data: { emailPrefix: newEmailPrefix },
    });

    return NextResponse.json({ emailPrefix: newEmailPrefix });
  } catch (error) {
    console.error("Failed to regenerate email prefix:", error);
    return NextResponse.json(
      { error: "メールアドレスの再生成に失敗しました" },
      { status: 500 }
    );
  }
}
