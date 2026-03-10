import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * セキュリティヘッダーを追加するmiddleware
 */
export function middleware(request: NextRequest) {
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
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.jsで必要
    "style-src 'self' 'unsafe-inline'", // Tailwind等で必要
    "img-src 'self' data: blob: https:", // 画像: 外部アバター等を許可
    "font-src 'self'",
    "connect-src 'self' https:", // API呼び出し
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
