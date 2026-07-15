import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（認証・DB）を先頭でモックして外部を一切読ませない。
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    mute: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { POST, DELETE } from "./route";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

const mockAuth = vi.mocked(getCurrentUser);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockMuteUpsert = vi.mocked(prisma.mute.upsert);
const mockMuteDeleteMany = vi.mocked(prisma.mute.deleteMany);

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;
const ME = { id: "me", username: "me", instance: { domain: "handon.club" } } as unknown as SessionUser;

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/mutes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/mutes", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ME);
});

describe("POST /api/v1/mutes", () => {
  it("未認証なら401", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(postReq({ handle: "bob", duration: "7d" }));
    expect(res.status).toBe(401);
  });

  it("不正な期間指定なら400", async () => {
    const res = await POST(postReq({ handle: "bob", duration: "3d" }));
    expect(res.status).toBe(400);
    expect(mockMuteUpsert).not.toHaveBeenCalled();
  });

  it("対象指定が無ければ400", async () => {
    const res = await POST(postReq({ duration: "7d" }));
    expect(res.status).toBe(400);
  });

  it("対象が存在しなければ404", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const res = await POST(postReq({ handle: "ghost@example.com", duration: "7d" }));
    expect(res.status).toBe(404);
  });

  it("自分自身はミュートできない（400）", async () => {
    mockUserFindFirst.mockResolvedValue({ id: "me" } as never);
    const res = await POST(postReq({ handle: "me", duration: "7d" }));
    expect(res.status).toBe(400);
    expect(mockMuteUpsert).not.toHaveBeenCalled();
  });

  it("有期ミュートを upsert し expiresAt を返す", async () => {
    mockUserFindFirst.mockResolvedValue({ id: "bob" } as never);
    mockMuteUpsert.mockResolvedValue({} as never);
    const res = await POST(postReq({ handle: "bob@example.com", duration: "7d" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(typeof json.expiresAt).toBe("string");
    expect(mockMuteUpsert).toHaveBeenCalledOnce();
    const arg = mockMuteUpsert.mock.calls[0][0];
    expect(arg.where.muterId_mutedUserId).toEqual({ muterId: "me", mutedUserId: "bob" });
  });

  it("無期ミュートは expiresAt=null", async () => {
    mockUserFindFirst.mockResolvedValue({ id: "bob" } as never);
    mockMuteUpsert.mockResolvedValue({} as never);
    const res = await POST(postReq({ handle: "bob@example.com", duration: "indefinite" }));
    const json = await res.json();
    expect(json.expiresAt).toBeNull();
  });

  it("mutedUserId 指定でも解決できる", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "bob" } as never);
    mockMuteUpsert.mockResolvedValue({} as never);
    const res = await POST(postReq({ mutedUserId: "bob", duration: "1d" }));
    expect(res.status).toBe(200);
    expect(mockUserFindUnique).toHaveBeenCalledOnce();
  });
});

describe("DELETE /api/v1/mutes", () => {
  it("未認証なら401", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(deleteReq({ mutedUserId: "bob" }));
    expect(res.status).toBe(401);
  });

  it("対象指定が無ければ400", async () => {
    const res = await DELETE(deleteReq({}));
    expect(res.status).toBe(400);
  });

  it("正常時は deleteMany を対象で絞って呼ぶ", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "bob" } as never);
    mockMuteDeleteMany.mockResolvedValue({ count: 1 } as never);
    const res = await DELETE(deleteReq({ mutedUserId: "bob" }));
    expect(res.status).toBe(200);
    expect(mockMuteDeleteMany).toHaveBeenCalledWith({
      where: { muterId: "me", mutedUserId: "bob" },
    });
  });
});
