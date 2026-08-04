import { describe, it, expect, vi, beforeEach } from "vitest";

// 境界（セッション）をモックする。
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
  getCurrentSessionJti: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

import { DELETE } from "./route";
import {
  getCurrentUser,
  getCurrentSessionJti,
  revokeOtherSessions,
} from "@/lib/auth/session";

const mockAuth = vi.mocked(getCurrentUser);
const mockJti = vi.mocked(getCurrentSessionJti);
const mockRevoke = vi.mocked(revokeOtherSessions);

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;
const ME = { id: "u1", username: "alice", instance: { domain: "handon.club" } } as unknown as SessionUser;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ME);
  mockJti.mockResolvedValue("jti-current");
  mockRevoke.mockResolvedValue(3);
});

describe("DELETE /api/v1/sessions", () => {
  it("未認証なら401を返し、失効させない", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("現在のセッションIDが取れなければ401（全部消してしまわない）", async () => {
    mockJti.mockResolvedValue(null);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("この端末を除いて失効させ、件数を返す", async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, count: 3 });
    expect(mockRevoke).toHaveBeenCalledWith("u1", "jti-current");
  });

  it("他端末が無ければ0件で成功する", async () => {
    mockRevoke.mockResolvedValue(0);

    const res = await DELETE();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, count: 0 });
  });

  it("失効処理が落ちたら500を返す", async () => {
    mockRevoke.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE();

    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});
