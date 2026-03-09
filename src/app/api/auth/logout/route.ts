/**
 * ログアウトエンドポイント
 * POST /api/auth/logout
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSessionCookie } from "@/lib/auth/session";

export async function POST() {
  try {
    // Cookie削除（JWTではこれだけでセッション無効化）
    // 動的クライアント登録のため、トークン無効化はスキップ
    // （client_id/secretがDBに保存されていないため）
    await deleteSessionCookie();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);

    // エラーでもCookieは削除
    const cookieStore = await cookies();
    cookieStore.delete("movapic_session");

    return NextResponse.json({ success: true });
  }
}
