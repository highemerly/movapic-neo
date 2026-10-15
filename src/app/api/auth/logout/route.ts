/**
 * ログアウトエンドポイント
 * POST /api/auth/logout
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSessionCookie, revokeCurrentSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";

export async function POST() {
  // pitfall: 以前は Cookie を消すだけで、LoginSession が有効のまま残っていた（漏れた JWT の写しが
  // ログアウト後も通り、/settings/sessions にも有効として出続けた）。Cookie を消す前に失効させる。
  // Fediverse のアクセストークンは失効させない（ログアウト中も Bot・メール投稿が本人のトークンで動くため）。
  let revoked = true;
  try {
    await revokeCurrentSession();
  } catch (error) {
    revoked = false;
    console.error("Logout: failed to revoke session:", error);
  }

  try {
    await deleteSessionCookie();
  } catch (error) {
    console.error("Logout error:", error);

    // エラーでもCookieは削除
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  // 失効の記録に失敗しても、この端末の Cookie は消えている（この端末からはログアウト済み）。
  // ただし他所の写しは生きているので成功とは返さない。
  return revoked
    ? NextResponse.json({ success: true })
    : NextResponse.json({ success: false }, { status: 500 });
}
