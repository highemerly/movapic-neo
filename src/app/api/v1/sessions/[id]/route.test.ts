import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
  revokeSession: vi.fn(),
}));

import { DELETE } from "./route";
import { getCurrentUser, revokeSession } from "@/lib/auth/session";

const mockGetUser = vi.mocked(getCurrentUser);
const mockRevoke = vi.mocked(revokeSession);

const USER = { id: "u1", username: "alice" } as unknown as Awaited<ReturnType<typeof getCurrentUser>>;
const req = () => new NextRequest("http://localhost/api/v1/sessions/sess-1", { method: "DELETE" });
const ctx = { params: Promise.resolve({ id: "sess-1" }) };

beforeEach(() => vi.clearAllMocks());

async function json(res: Response): Promise<{ success?: boolean; error?: string }> {
  return res.json();
}

describe("DELETE /api/v1/sessions/[id]", () => {
  it("未認証は 401", async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(401);
    expect((await json(res)).error).toBe("認証が必要です");
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("失効は本人のuserIdにスコープして呼ぶ（他人のセッション失効=IDOR防止の回帰ガード）", async () => {
    mockGetUser.mockResolvedValue(USER);
    mockRevoke.mockResolvedValue(true);
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
    // revokeSession(自分のuserId, 対象sessionId) の順で呼ばれる＝他人のIDを渡せない
    expect(mockRevoke).toHaveBeenCalledWith("u1", "sess-1");
  });

  it("対象が無い（他人のもの含む）と revokeSession が false → 404", async () => {
    mockGetUser.mockResolvedValue(USER);
    mockRevoke.mockResolvedValue(false);
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("対象のセッションが見つかりません");
  });

  it("失効処理が例外なら 500", async () => {
    mockGetUser.mockResolvedValue(USER);
    mockRevoke.mockRejectedValue(new Error("db down"));
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("セッションの失効に失敗しました");
  });
});
