/**
 * セッション整合（GET /api/auth/reconcile）の回帰テスト。
 *
 * このエンドポイントは「JWTは有効だが対応する LoginSession が失効/不在」という
 * 食い違いだけを掃除する。ここを無条件破棄に戻すと、GET かつ CSRF トークン無しで
 * 到達できる性質から <img src="…/api/auth/reconcile"> で他サイトから強制ログアウト
 * させられる（ログアウトCSRF）。
 *
 * よって守るのは対称な2点:
 *   - 食い違いのときだけ Cookie を失効させる
 *   - 正常なセッション（JWT有効かつDBセッション生存）は絶対に触らない
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock は vi.hoisted で先に生成する。
const { getSessionClaimsMock, getCurrentUserMock } = vi.hoisted(() => ({
  getSessionClaimsMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionClaims: getSessionClaimsMock,
  getCurrentUser: getCurrentUserMock,
}));

import { GET } from "./route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";

const BASE_URL = "https://shamezo.example";

const CLAIMS = { userId: "user-1", instanceId: "inst-1", jti: "jti-1" };
const LIVE_USER = { id: "user-1", username: "alice" };

beforeEach(() => {
  vi.clearAllMocks();
});

function req() {
  return new NextRequest(`${BASE_URL}/api/auth/reconcile`);
}

/** Set-Cookie でセッションCookieが失効させられたか */
function clearsSessionCookie(res: Response): boolean {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.includes(`${SESSION_COOKIE_NAME}=;`) && /Max-Age=0/i.test(setCookie);
}

describe("GET /api/auth/reconcile", () => {
  it("JWTが無効（claims なし）なら Cookie を触らず / へ戻す", async () => {
    getSessionClaimsMock.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    expect(clearsSessionCookie(res)).toBe(false);
    // claims が無い時点で掃除対象になりえないため、DB照合まで行かない
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it("正常なセッション（JWT有効かつDBセッション生存）は破棄しない（ログアウトCSRF防止）", async () => {
    getSessionClaimsMock.mockResolvedValue(CLAIMS);
    getCurrentUserMock.mockResolvedValue(LIVE_USER);

    const res = await GET(req());

    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    expect(clearsSessionCookie(res)).toBe(false);
  });

  it("食い違い（JWT有効・DBセッション不在）のときだけ Cookie を失効させる", async () => {
    getSessionClaimsMock.mockResolvedValue(CLAIMS);
    getCurrentUserMock.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    expect(clearsSessionCookie(res)).toBe(true);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(/SameSite=lax/i.test(setCookie)).toBe(true);
    expect(setCookie).toContain("Path=/");
  });

  it("どの分岐でも / へのリダイレクトで着地する", async () => {
    for (const [claims, user] of [
      [null, null],
      [CLAIMS, LIVE_USER],
      [CLAIMS, null],
    ] as const) {
      getSessionClaimsMock.mockResolvedValue(claims);
      getCurrentUserMock.mockResolvedValue(user);
      const res = await GET(req());
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`${BASE_URL}/`);
    }
  });
});
