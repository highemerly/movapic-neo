import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 認可（isAdmin）は本物を使い、DB/ストレージだけモック。
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/storage/storage", () => ({ deleteImage: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    image: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    report: { updateMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteImage } from "@/lib/storage/storage";
import prisma from "@/lib/db";
import { ErrorCodes } from "@/lib/errors";

const mockGetUser = vi.mocked(getCurrentUser);
const mockDeleteImage = vi.mocked(deleteImage);
const mockFindUnique = vi.mocked(prisma.image.findUnique);
const mockImageDelete = vi.mocked(prisma.image.delete);
const mockTx = vi.mocked(prisma.$transaction);

const adminUser = () =>
  ({ username: "admin", instance: { domain: "handon.club" } }) as unknown as Awaited<
    ReturnType<typeof getCurrentUser>
  >;
const normalUser = () =>
  ({ username: "bob", instance: { domain: "handon.club" } }) as unknown as Awaited<
    ReturnType<typeof getCurrentUser>
  >;

const req = (action?: unknown) =>
  new NextRequest("http://localhost/api/v1/admin/images/img1/moderate", {
    method: "POST",
    body: JSON.stringify(action === undefined ? {} : { action }),
    headers: { "content-type": "application/json" },
  });
const ctx = { params: Promise.resolve({ id: "img1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_ACCTS = "admin@handon.club";
  mockTx.mockResolvedValue([]);
  mockFindUnique.mockResolvedValue({
    id: "img1",
    storageKey: "2026/1/1/key",
    thumbnailKey: "2026/1/1/thumb",
  } as unknown as Awaited<ReturnType<typeof prisma.image.findUnique>>);
});

async function json(res: Response): Promise<{ success?: boolean; error?: { code: string } }> {
  return res.json();
}

describe("POST moderate: 認可（回帰ガード）", () => {
  it("未認証は 404 で存在を隠し、DBに触れない", async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await POST(req("disable"), ctx);
    expect(res.status).toBe(404);
    expect((await json(res)).error?.code).toBe(ErrorCodes.NOT_FOUND);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("非管理者は 404 で存在を隠し、DBに触れない", async () => {
    mockGetUser.mockResolvedValue(normalUser()); // bob@handon.club は ADMIN_ACCTS 外
    const res = await POST(req("delete"), ctx);
    expect(res.status).toBe(404);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockDeleteImage).not.toHaveBeenCalled();
    expect(mockImageDelete).not.toHaveBeenCalled();
  });
});

describe("POST moderate: 管理者の操作", () => {
  beforeEach(() => mockGetUser.mockResolvedValue(adminUser()));

  it("不正な action は 400", async () => {
    const res = await POST(req("nuke"), ctx);
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe(ErrorCodes.VALIDATION_INVALID);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("画像が無ければ 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(req("disable"), ctx);
    expect(res.status).toBe(404);
  });

  it("disable は isDisabled=true と通報 resolved をトランザクションで実行", async () => {
    const res = await POST(req("disable"), ctx);
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "img1" }, data: { isDisabled: true } })
    );
  });

  it("restore は isDisabled=false", async () => {
    const res = await POST(req("restore"), ctx);
    expect(res.status).toBe(200);
    expect(prisma.image.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "img1" }, data: { isDisabled: false } })
    );
  });

  it("delete は R2（本画像＋サムネ）とDBレコードを削除", async () => {
    const res = await POST(req("delete"), ctx);
    expect(res.status).toBe(200);
    expect(mockDeleteImage).toHaveBeenCalledWith("2026/1/1/key");
    expect(mockDeleteImage).toHaveBeenCalledWith("2026/1/1/thumb");
    expect(mockImageDelete).toHaveBeenCalledWith({ where: { id: "img1" } });
  });

  it("dismiss は通報のみ dismissed（画像は不変）", async () => {
    const res = await POST(req("dismiss"), ctx);
    expect(res.status).toBe(200);
    expect(prisma.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "dismissed" }) })
    );
    expect(prisma.image.update).not.toHaveBeenCalled();
    expect(mockImageDelete).not.toHaveBeenCalled();
  });
});
