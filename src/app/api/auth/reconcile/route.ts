/**
 * セッション整合エンドポイント
 * GET /api/auth/reconcile
 *
 * 「JWTは有効（署名+exp）だが、対応する LoginSession が失効/不在」という
 * 食い違い状態のCookieを掃除するための着地点。
 *
 * 背景: 表示系（getSessionClaims / ヘッダー・トップページ）はDBレスで JWT を
 * 信用するが、ゲート系（getCurrentUser）はDB照合する。スライディングで JWT が
 * 実質不滅になったため、DB側セッションが死んでいても Cookie が延命され続け、
 * 「トップは自分をログイン中とみなすのでログインフォームを出さない一方、
 * ゲートページは未ログイン扱いで / に飛ばす」という無限ループが起きうる。
 *
 * ここでセッションCookieを削除して / に戻すと、以降は claims も null になり
 * （ヘッダーもログアウト表示・トップにログインフォーム表示）整合が取れる。
 * 認証系ルートなので proxy.ts のスライディング対象外＝再署名と競合しない。
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";
import { getSessionClaims, getCurrentUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));

  // GET かつ CSRF トークン無しで到達できるため、無条件破棄だと外部ページの
  // <img src=".../api/auth/reconcile"> で正常ログイン中のユーザーを強制ログアウト
  // させられる（ログアウトCSRF）。本エンドポイント本来の役割である「JWTは有効だが
  // 対応する LoginSession が失効/不在」という食い違いが実際に成立するときだけ掃除する。
  // 正常なセッション（JWT有効かつDBセッション生存）は破棄しないので、クロスサイトの
  // 強制ログアウトは成立しない。
  const claims = await getSessionClaims(); // JWTのみ検証（DBレス）
  const liveUser = claims ? await getCurrentUser() : null; // DB失効チェック込み
  const isMismatch = claims !== null && liveUser === null;

  if (isMismatch) {
    // 明示的に空値+maxAge0で確実に失効させる（delete相当）
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
