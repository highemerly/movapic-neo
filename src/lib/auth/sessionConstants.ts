/**
 * セッションCookie/JWTの共有定数
 *
 * prisma や next/headers を import しない edge-safe なモジュール。
 * サーバー用の session.ts と、ミドルウェア（proxy.ts / edge実行）から
 * スライディング更新するための slidingSession.ts の双方から参照し、
 * Cookie名・有効期限のドリフトを防ぐ。
 */

export const SESSION_COOKIE_NAME = "movapic_session";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7日
