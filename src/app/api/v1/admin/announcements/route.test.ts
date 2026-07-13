import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界を全てモック（DB / 認証 / キャッシュ破棄）。
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: { announcement: { create: vi.fn() } },
}));

import { POST } from "./route";
import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import prisma from "@/lib/db";

const mockUser = vi.mocked(getCurrentUser);
const mockIsAdmin = vi.mocked(isAdmin);
const mockCreate = vi.mocked(prisma.announcement.create);
const mockRevalidate = vi.mocked(revalidateTag);

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/announcements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  type: "info",
  message: "新機能をリリースしました",
  publishAt: "2026-07-13T00:00:00.000Z",
  pinnedUntil: "2026-07-20T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({
    username: "admin",
    instance: { domain: "example.com" },
  } as never);
  mockIsAdmin.mockReturnValue(true);
  mockCreate.mockResolvedValue({ id: 42 } as never);
});

describe("POST /api/v1/admin/announcements", () => {
  it("管理者は作成でき、revalidateTag が呼ばれる", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, id: 42 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0].data;
    expect(arg.type).toBe("info");
    expect(arg.publishAt).toBeInstanceOf(Date);
    expect(arg.pinnedUntil).toBeInstanceOf(Date);
    expect(mockRevalidate).toHaveBeenCalledWith("announcements", "max");
  });

  it("pinnedUntil 省略時は null で作成される", async () => {
    const { pinnedUntil, ...noPinned } = validBody;
    void pinnedUntil;
    const res = await POST(makeReq(noPinned));
    expect(res.status).toBe(200);
    expect(mockCreate.mock.calls[0][0].data.pinnedUntil).toBeNull();
  });

  it("非管理者には 404 を返し、作成しない", async () => {
    mockIsAdmin.mockReturnValue(false);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("未知の type は 400", async () => {
    const res = await POST(makeReq({ ...validBody, type: "bogus" }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("message が空なら 400", async () => {
    const res = await POST(makeReq({ ...validBody, message: "   " }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("publishAt が不正なら 400", async () => {
    const res = await POST(makeReq({ ...validBody, publishAt: "not-a-date" }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("pinnedUntil が不正なら 400", async () => {
    const res = await POST(makeReq({ ...validBody, pinnedUntil: "xxx" }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
