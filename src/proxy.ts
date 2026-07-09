import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { maybeSlideSession } from "@/lib/auth/slidingSession";

// 状態変更を伴うHTTPメソッド（CSRF検証の対象）
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF多層防御: ブラウザ発のクロスサイトな状態変更リクエストを拒否する。
 *
 * Cookie(JWTセッション)認証 + SameSite=Lax の最後の壁として、明示的に
 * オリジンを検証する。判定の主軸はブラウザが自動付与する Sec-Fetch-Site
 * （プロキシ越しでも正しく計算され、追加のプリフライトも発生しない）。
 *
 * 「クロスサイトと確証できた時だけ」拒否する方針:
 * - Sec-Fetch-Site / Origin がどちらも無いリクエストは非ブラウザ（メール
 *   Worker等のサーバー間呼び出し）であり、攻撃者が被害者のCookieを送らせる
 *   CSRF経路にはなり得ないため許可する。
 *
 * @returns 拒否すべきなら 403 レスポンス、許可なら null
 */
function rejectCrossSiteMutation(request: NextRequest): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method)) return null;

  const path = request.nextUrl.pathname;
  // サーバー間内部API（X-API-Keyで認証・ブラウザ非経由）は対象外
  if (path.startsWith("/api/internal") || path.startsWith("/api/v1/ingest")) {
    return null;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite) {
    // same-origin / same-site / none(直接ナビゲーション) は許可、cross-site のみ拒否
    if (secFetchSite === "cross-site") {
      return forbidden();
    }
    return null;
  }

  // Sec-Fetch-Site 非対応の古いブラウザ向けフォールバック: Origin を突合
  const origin = request.headers.get("origin");
  if (origin) {
    const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const forwardedProto =
      request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "");
    const allowed = new Set(
      [
        request.nextUrl.origin,
        forwardedHost ? `${forwardedProto}://${forwardedHost}` : null,
        (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, ""),
      ].filter(Boolean) as string[]
    );
    if (!allowed.has(origin)) {
      return forbidden();
    }
  }

  // Sec-Fetch-Site も Origin も無い = 非ブラウザのサーバー間呼び出し → 許可
  return null;
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "CSRF_DETECTED", message: "Cross-site request blocked" } },
    { status: 403 }
  );
}

/**
 * COMPONENT_ROLE によるルート境界の強制 ＋ セキュリティヘッダー付与。
 *
 * ルート境界（NetworkPolicy に加えた多層防御）:
 * - compute: /api/internal/* と /api/health 以外は 404（アプリ/秘密情報ルートを compute 上で動かさない）
 * - web / worker-front: /api/internal/* を 404（内部APIは compute だけが提供）
 * - 未設定(dev all-in-one): 制限なし
 */
export async function proxy(request: NextRequest) {
  const role = process.env.COMPONENT_ROLE;
  const path = request.nextUrl.pathname;
  const isInternal = path.startsWith("/api/internal");

  if (role === "compute") {
    if (!isInternal && path !== "/api/health") {
      return new NextResponse(null, { status: 404 });
    }
  } else if (role === "web" || role === "worker-front") {
    if (isInternal) {
      return new NextResponse(null, { status: 404 });
    }
  }

  // CSRF多層防御: ブラウザ発のクロスサイトな状態変更を拒否
  const csrfRejection = rejectCrossSiteMutation(request);
  if (csrfRejection) return csrfRejection;

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

  // スライディングセッション: 有効なJWTがアクティブに使われている限り
  // 有効期限を7日窓で自動延長する（詳細は slidingSession.ts）。
  await maybeSlideSession(request, response);

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
