/**
 * セッション確認エンドポイント
 * GET /api/auth/session
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    // クライアントに返すユーザー情報（トークンは除外）
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailPrefix: user.emailPrefix,
        instance: {
          domain: user.instance.domain,
          type: user.instance.type,
        },
      },
    });
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json({ user: null });
  }
}
