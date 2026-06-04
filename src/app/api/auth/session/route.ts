/**
 * セッション確認エンドポイント
 * GET /api/auth/session
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

// 共有キャッシュ・ブラウザバックでの他ユーザーへの混入を防ぐ
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ user: null }, { headers: NO_STORE_HEADERS });
    }

    // クライアントに返すユーザー情報（トークンは除外）
    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          emailPrefix: user.emailPrefix,
          displayMode: user.displayMode ?? "system",
          instance: {
            domain: user.instance.domain,
            type: user.instance.type,
          },
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json({ user: null }, { headers: NO_STORE_HEADERS });
  }
}
