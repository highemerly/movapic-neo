/**
 * プロフィール取得エンドポイント
 * GET /api/v1/me
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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
    });
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return NextResponse.json(
      { error: "プロフィールの取得に失敗しました" },
      { status: 500 }
    );
  }
}
