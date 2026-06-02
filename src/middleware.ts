import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * セキュリティヘッダーを追加するmiddleware
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // X-Content-Type-Options: MIMEタイプスニッフィング防止
  response.headers.set("X-Content-Type-Options", "nosniff");

  // X-Frame-Options: クリックジャッキング防止
  response.headers.set("X-Frame-Options", "DENY");

  // X-XSS-Protection: XSSフィルター（レガシーブラウザ向け）
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer-Policy: リファラー情報の制御
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions-Policy: ブラウザ機能の制限
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()"
  );

  // Content-Security-Policy
  const mediaProxyOrigin = process.env.MEDIA_PROXY_BASE_URL ?? "";
  const storagePublicOrigin = (process.env.S3_PUBLIC_URL ?? process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`, // dev時のみReactデバッグ用にunsafe-eval許可
    "style-src 'self' 'unsafe-inline'", // Tailwind等で必要
    `img-src 'self' data: blob: ${mediaProxyOrigin} ${storagePublicOrigin}`, // 画像: アバターproxy・投稿画像
    "font-src 'self'",
    "connect-src 'self' https:", // Fediverseインスタンスは任意のため https: を維持
    "frame-ancestors 'none'", // iframe埋め込み禁止
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

// 静的ファイルとAPIルート以外に適用
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
