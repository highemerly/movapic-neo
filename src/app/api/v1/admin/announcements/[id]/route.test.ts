import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: { announcement: { update: vi.fn(), delete: vi.fn() } },
}));

import { PATCH, DELETE } from "./route";
import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import prisma from "@/lib/db";

const mockUser = vi.mocked(getCurrentUser);
const mockIsAdmin = vi.mocked(isAdmin);
const mockUpdate = vi.mocked(prisma.announcement.update);
const mockDelete = vi.mocked(prisma.announcement.delete);
const mockRevalidate = vi.mocked(revalidateTag);

const validBody = {
  type: "warning",
  message: "更新後の本文",
  publishAt: "2026-07-13T00:00:00.000Z",
};

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/announcements/5", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function deleteReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/announcements/5", {
    method: "DELETE",
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({
    username: "admin",
    instance: { domain: "example.com" },
  } as never);
  mockIsAdmin.mockReturnValue(true);
  mockUpdate.mockResolvedValue({ id: 5 } as never);
  mockDelete.mockResolvedValue({ id: 5 } as never);
});

describe("PATCH /api/v1/admin/announcements/[id]", () => {
  it("管理者は更新でき revalidateTag が呼ばれる", async () => {
    const res = await PATCH(patchReq(validBody), ctx("5"));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({ type: "warning", message: "更新後の本文" }),
    });
    expect(mockRevalidate).toHaveBeenCalledWith("announcements", "max");
  });

  it("非管理者には 404", async () => {
    mockIsAdmin.mockReturnValue(false);
    const res = await PATCH(patchReq(validBody), ctx("5"));
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("id が不正なら 400", async () => {
    const res = await PATCH(patchReq(validBody), ctx("abc"));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("入力が不正なら 400", async () => {
    const res = await PATCH(patchReq({ ...validBody, message: "" }), ctx("5"));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/admin/announcements/[id]", () => {
  it("管理者は削除でき revalidateTag が呼ばれる", async () => {
    const res = await DELETE(deleteReq(), ctx("5"));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(mockRevalidate).toHaveBeenCalledWith("announcements", "max");
  });

  it("非管理者には 404", async () => {
    mockIsAdmin.mockReturnValue(false);
    const res = await DELETE(deleteReq(), ctx("5"));
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("id が不正なら 400", async () => {
    const res = await DELETE(deleteReq(), ctx("0"));
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
