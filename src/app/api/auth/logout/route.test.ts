/**
 * ログアウト（POST /api/auth/logout）の回帰テスト。
 *
 * ログアウトの実体は2つ:
 *   1. LoginSession を失効させる（Cookie を消すだけだと、漏れた JWT の写しが有効期限まで通る）
 *   2. この端末の Cookie を消す（失効の記録に失敗しても、例外でも、必ず消す＝居座りを作らない）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock は vi.hoisted で先に生成する。
const { jar, deleteSessionCookieMock, revokeCurrentSessionMock, calls } = vi.hoisted(() => {
  const deleted: string[] = [];
  const calls: string[] = [];
  return {
    jar: {
      deleted,
      delete: (name: string) => {
        deleted.push(name);
      },
    },
    deleteSessionCookieMock: vi.fn(),
    revokeCurrentSessionMock: vi.fn(),
    calls,
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));

vi.mock("@/lib/auth/session", () => ({
  deleteSessionCookie: deleteSessionCookieMock,
  revokeCurrentSession: revokeCurrentSessionMock,
}));

import { POST } from "./route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/sessionConstants";

beforeEach(() => {
  vi.clearAllMocks();
  jar.deleted.length = 0;
  calls.length = 0;
  revokeCurrentSessionMock.mockImplementation(async () => {
    calls.push("revoke");
  });
  deleteSessionCookieMock.mockImplementation(async () => {
    calls.push("deleteCookie");
  });
});

describe("POST /api/auth/logout", () => {
  it("セッションを失効させてから Cookie を削除し、success を返す（jti は Cookie から読むため順序が要る）", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(calls).toEqual(["revoke", "deleteCookie"]);
  });

  it("失効の記録に失敗しても Cookie は消すが、他所の写しが生きているので成功とは返さない", async () => {
    revokeCurrentSessionMock.mockRejectedValue(new Error("db down"));

    const res = await POST();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false });
    expect(deleteSessionCookieMock).toHaveBeenCalledOnce();
  });

  it("Cookie の削除処理が例外でも Cookie を消して success を返す（居座りを作らない）", async () => {
    deleteSessionCookieMock.mockRejectedValue(new Error("cookie store unavailable"));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(jar.deleted).toContain(SESSION_COOKIE_NAME);
  });
});
