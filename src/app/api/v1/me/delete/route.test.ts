import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（認証・DB・キュー）を先頭でモックして外部を一切読ませない。
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
  deleteSessionCookie: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  default: {
    image: { findMany: vi.fn() },
    user: { delete: vi.fn() },
  },
}));
vi.mock("@/lib/queue", () => ({ enqueueDeleteAccount: vi.fn() }));

import { POST } from "./route";
import { getCurrentUser, deleteSessionCookie } from "@/lib/auth/session";
import { enqueueDeleteAccount } from "@/lib/queue";
import prisma from "@/lib/db";

const mockAuth = vi.mocked(getCurrentUser);
const mockDeleteCookie = vi.mocked(deleteSessionCookie);
const mockImageFindMany = vi.mocked(prisma.image.findMany);
const mockUserDelete = vi.mocked(prisma.user.delete);
const mockEnqueue = vi.mocked(enqueueDeleteAccount);

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;
const ME = {
  id: "u1",
  username: "alice",
  instance: { domain: "handon.club" },
} as unknown as SessionUser;

/** 確認入力の正解（username@domain）。 */
const REQUIRED_NAME = "alice@handon.club";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/me/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ME);
  mockImageFindMany.mockResolvedValue([]);
  mockUserDelete.mockResolvedValue({} as never);
  mockEnqueue.mockResolvedValue(undefined);
});

describe("POST /api/v1/me/delete", () => {
  it("未認証なら401を返し、削除を一切実行しない", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);

    const res = await POST(req({ confirmName: REQUIRED_NAME }));

    expect(res.status).toBe(401);
    expect(mockUserDelete).not.toHaveBeenCalled();
    expect(mockDeleteCookie).not.toHaveBeenCalled();
  });

  it("確認入力が一致しなければ400を返し、削除しない", async () => {
    const res = await POST(req({ confirmName: "alice" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "アカウント名が一致しません" });
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("確認入力が無くても400（未指定を空文字として扱い、一致しない）", async () => {
    const res = await POST(req({}));

    expect(res.status).toBe(400);
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("body が壊れたJSONでも500ではなく400で拒否する", async () => {
    const res = await POST(req("{壊れている"));

    expect(res.status).toBe(400);
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("確認入力の前後空白は無視して一致とみなす", async () => {
    const res = await POST(req({ confirmName: `  ${REQUIRED_NAME}  ` }));

    expect(res.status).toBe(200);
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("別ユーザー名では削除できない（他人の名前を入れても自分の判定に通らない）", async () => {
    const res = await POST(req({ confirmName: "bob@handon.club" }));

    expect(res.status).toBe(400);
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("一致すればユーザーを削除し、セッションCookieを破棄して成功を返す", async () => {
    const res = await POST(req({ confirmName: REQUIRED_NAME }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(mockDeleteCookie).toHaveBeenCalled();
  });

  it("S3キーはユーザー削除より先に集める（カスケードで取得不能になるため）", async () => {
    const order: string[] = [];
    // Prisma のメソッド型は Prisma__Client を要求するため、実装は never で通す。
    mockImageFindMany.mockImplementation((async () => {
      order.push("findMany");
      return [];
    }) as never);
    mockUserDelete.mockImplementation((async () => {
      order.push("delete");
      return {};
    }) as never);

    await POST(req({ confirmName: REQUIRED_NAME }));

    expect(order).toEqual(["findMany", "delete"]);
  });

  it("本体画像とサムネイルの両方を削除ジョブへ渡す", async () => {
    mockImageFindMany.mockResolvedValue([
      { storageKey: "2026/01/01/a.jpg", thumbnailKey: "2026/01/01/a-thumb.webp" },
      { storageKey: "2026/01/02/b.jpg", thumbnailKey: null },
    ] as never);

    await POST(req({ confirmName: REQUIRED_NAME }));

    expect(mockEnqueue).toHaveBeenCalledWith({
      userId: "u1",
      storageKeys: ["2026/01/01/a.jpg", "2026/01/01/a-thumb.webp", "2026/01/02/b.jpg"],
    });
  });

  it("S3削除ジョブの enqueue が失敗しても、削除自体は成立させる", async () => {
    mockEnqueue.mockRejectedValue(new Error("queue down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req({ confirmName: REQUIRED_NAME }));

    expect(res.status).toBe(200);
    expect(mockUserDelete).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("ユーザー削除が失敗したら500を返し、Cookieは破棄しない", async () => {
    mockUserDelete.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req({ confirmName: REQUIRED_NAME }));

    expect(res.status).toBe(500);
    expect(mockDeleteCookie).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
