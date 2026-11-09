import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（認証・DB）をモックする。区切りの計算（dayClock）は本物を通し、トランザクションは同じモックを渡す。
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => {
  const db = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    dayBoundarySetting: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return { default: db };
});

import { PUT } from "./route";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

const mockAuth = vi.mocked(getCurrentUser);
const mockFindMany = vi.mocked(prisma.dayBoundarySetting.findMany);
const mockCreate = vi.mocked(prisma.dayBoundarySetting.create);

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;
const ME = { id: "u1" } as unknown as SessionUser;

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/me/day-boundary", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T15:00:00+09:00"));
  mockAuth.mockResolvedValue(ME);
  mockFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PUT /api/v1/me/day-boundary", () => {
  it("未ログインは401", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);
    expect((await PUT(req({ hour: 2 }))).status).toBe(401);
  });

  it.each([[-1], [5], [2.5], ["2"], [null]])("hour=%j は400で何も書かない", async (hour) => {
    const res = await PUT(req({ hour }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "VALIDATION_INVALID" },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("壊れた JSON は400", async () => {
    expect((await PUT(req("{"))).status).toBe(400);
  });

  it("明日から効く。今日の区切りは変わらず、予約を返す", async () => {
    const res = await PUT(req({ hour: 2 }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(res.json()).resolves.toEqual({
      success: true,
      todayHour: 0,
      upcoming: [{ fromDate: "2026-11-09", hour: 2 }],
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: "u1", fromDate: new Date("2026-11-09T00:00:00Z"), hour: 2 },
    });
  });
});
