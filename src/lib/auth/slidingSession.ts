/**
 * スライディングセッション（アクティブなら有効期限を自動延長）
 *
 * ミドルウェア（proxy.ts）から呼ぶ edge-safe なモジュール。jose だけに依存し、
 * prisma / next/headers は一切 import しない（Edge実行のため）。
 *
 * 仕組み: 有効なJWTを検出し、発行(iat)から REFRESH_AFTER_SECONDS 以上経過して
 * いれば、同一ペイロード（jti含む）のまま exp/iat だけ新しい7日窓へ再署名して
 * Set-Cookie する。これにより「使い続けている限り失効しない」挙動になる。
 * ただしセッション開始(sat)から MAX_SESSION_AGE_SECONDS を超えたら延長を止め、
 * 現在の7日窓が切れ次第 強制再ログインさせる（絶対上限）。
 *
 * 設計上の割り切り:
 * - jti・userId 等はそのまま維持するため、LoginSession の失効モデル
 *   （jti + revokedAt）は無変更で機能する。失効済みセッションがCookieを延命
 *   しても、getCurrentUser 側のDB検証で未認証扱いになる（セキュリティ後退なし）。
 * - 毎リクエスト再署名すると Set-Cookie が乱発するため、iat から3日以上
 *   経過した時だけ再発行する。
 * - 期限切れ/署名不正のトークンは jwtVerify が例外を投げるので何もしない
 *   （Cookieは自然失効 → 再ログイン）。
 * - sat を持たない旧JWTは、初回スライド時に「今」を sat として刻む
 *   （その時点から90日上限を数え始める）。
 */

import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./sessionConstants";

// 発行からこの秒数以上経過したトークンだけ再発行する（Set-Cookie乱発の抑制）
const REFRESH_AFTER_SECONDS = 3 * 24 * 60 * 60; // 3日

// セッション開始(sat)からこの秒数を超えたら延長を止める（絶対上限）
const MAX_SESSION_AGE_SECONDS = 90 * 24 * 60 * 60; // 90日

function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * リクエストのセッションCookieを検証し、必要なら response に延長Cookieを付与する。
 * Cookieが無い/無効/期限切れ、または十分に新しい場合は何もしない。
 */
export async function maybeSlideSession(
  request: NextRequest,
  response: NextResponse
): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  let payload;
  try {
    // 署名は常に HS256（SignJWT 側でピン）。検証側も明示ピンして、将来の鍵型変更や
    // リファクタで alg 混同（非対称鍵の悪用・alg:none）が紛れ込む事故を防ぐ。
    ({ payload } = await jwtVerify(token, getJWTSecret(), {
      algorithms: ["HS256"],
    }));
  } catch {
    // 署名不正 or 期限切れ → 延長しない（自然失効させる）
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // 絶対上限: セッション開始(sat)から90日を超えたら延長しない。
  // sat が無い旧JWTは今を開始点とみなす（＝上限内なので延長する）。
  const sat = typeof payload.sat === "number" ? payload.sat : now;
  if (now - sat >= MAX_SESSION_AGE_SECONDS) {
    return;
  }

  const iat = typeof payload.iat === "number" ? payload.iat : null;
  // iat が無い（旧JWT）場合は延長対象にする（次回以降 iat 付きに置き換わる）
  if (iat !== null && now - iat < REFRESH_AFTER_SECONDS) {
    return;
  }

  // iat/exp/nbf を落とし、カスタムクレーム（userId/jti/username 等）だけ引き継ぐ。
  // sat は claims に残す（旧JWTで欠けていれば今の値を補う）。
  const { iat: _iat, exp: _exp, nbf: _nbf, ...claims } = payload;
  void _iat;
  void _exp;
  void _nbf;
  claims.sat = sat;

  const renewed = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getJWTSecret());

  // createSession と同一の属性で上書き（httpOnly / secure / sameSite=lax / path / maxAge）
  response.cookies.set(SESSION_COOKIE_NAME, renewed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}
