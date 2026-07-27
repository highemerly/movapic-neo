/**
 * ログアウト（POST /api/auth/logout）の回帰テスト。
 *
 * JWTセッションなので「Cookieを消す」ことだけがログアウトの実体＝ここが失敗すると
 * ログアウトしたつもりで居座る。よって守るのは1点:
 *   削除処理が例外を投げても、必ず Cookie は消えて success で返る（握って終わらせない）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock は vi.hoisted で先に生成する。
const { jar, deleteSessionCookieMock } = vi.hoisted(() => {
  const deleted: string[] = [];
  return {
    jar: {
      deleted,
      delete: (name: string) => {
        deleted.push(name);
      },
    },
    deleteSessionCookieMock: vi.fn(),
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));

vi.mock("@/lib/auth/session", () => ({
  deleteSessionCookie: deleteSessionCookieMock,
}));

import { POST } from "./route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";

beforeEach(() => {
  vi.clearAllMocks();
  jar.deleted.length = 0;
  deleteSessionCookieMock.mockResolvedValue(undefined);
});

describe("POST /api/auth/logout", () => {
  it("セッションCookieを削除して success を返す", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteSessionCookieMock).toHaveBeenCalledOnce();
  });

  it("削除処理が例外でも Cookie を消して success を返す（居座りを作らない）", async () => {
    deleteSessionCookieMock.mockRejectedValue(new Error("cookie store unavailable"));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(jar.deleted).toContain(SESSION_COOKIE_NAME);
  });
});
