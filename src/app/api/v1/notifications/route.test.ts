import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（認証・通知取得＝DB）を先頭でモックして外部を一切読ませない。
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/achievements/notifications", () => ({ getRecentNotifications: vi.fn() }));

import { GET } from "./route";
import { getCurrentUser } from "@/lib/auth/session";
import { getRecentNotifications } from "@/lib/achievements/notifications";

const mockAuth = vi.mocked(getCurrentUser);
const mockFetch = vi.mocked(getRecentNotifications);

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;
const ME = { id: "me", username: "me", instance: { domain: "handon.club" } } as unknown as SessionUser;

function req(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/notifications${query}`);
}

/** getRecentNotifications に渡った limit（第2引数）。 */
function passedLimit(): number | undefined {
  return mockFetch.mock.calls[0][1];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ME);
  mockFetch.mockResolvedValue([]);
});

describe("GET /api/v1/notifications", () => {
  it("未認証なら401", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("limit 未指定なら全件（undefined を渡す）", async () => {
    await GET(req());
    expect(passedLimit()).toBeUndefined();
  });

  it("limit 指定はそのまま渡す", async () => {
    await GET(req("?limit=5"));
    expect(passedLimit()).toBe(5);
  });

  it("上限50を超える指定は50に丸める", async () => {
    await GET(req("?limit=999"));
    expect(passedLimit()).toBe(50);
  });

  // pitfall: 数値化できない値・0 が「未指定＝全件」に化けると上限が無言で外れる。
  it("数値化できない limit でも全件にはならない", async () => {
    await GET(req("?limit=abc"));
    expect(passedLimit()).toBeTypeOf("number");
  });

  it("limit=0 は全件ではなく下限1に丸める", async () => {
    await GET(req("?limit=0"));
    expect(passedLimit()).toBe(1);
  });
});
