import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（DB・ハンドル解決）を先頭でモックして外部を一切読ませない。
vi.mock("@/lib/db", () => ({
  default: {
    user: { findFirst: vi.fn() },
    image: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/userHandle", () => ({
  parseUserHandle: (u: string) => ({ username: u, domain: "handon.club" }),
}));

import { GET } from "./route";
import prisma from "@/lib/db";

const mockUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockImageFindMany = vi.mocked(prisma.image.findMany);

function row(id: string) {
  return {
    id,
    storageKey: `k/${id}`,
    thumbnailKey: null,
    width: 100,
    height: 100,
    overlayText: "",
    position: "bottom",
    size: "medium",
    blurDataUrl: null,
    favoriteCount: 0,
    pinnedAt: null,
    createdAt: new Date("2026-07-15T00:00:00Z"),
  } as unknown as Awaited<ReturnType<typeof prisma.image.findMany>>[number];
}

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/public/users/alice/images${query}`);
}

const params = Promise.resolve({ username: "alice" });

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindFirst.mockResolvedValue({ id: "u1" } as Awaited<
    ReturnType<typeof prisma.user.findFirst>
  >);
});

describe("GET /api/v1/public/users/:username/images", () => {
  it("ユーザーが無ければ404", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const res = await GET(req(""), { params });
    expect(res.status).toBe(404);
  });

  it("通常ページ: 降順カーソルで nextCursor/hasMore を返す", async () => {
    mockImageFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => row(`id${i}`)));
    const res = await GET(req("?limit=20"), { params });
    const body = await res.json();

    const args = mockImageFindMany.mock.calls[0]![0]!;
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(body.images).toHaveLength(20);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe("id19");
  });

  it("since 指定: 昇順カーソルで新しい順に差分を返し gap を含む", async () => {
    mockImageFindMany.mockResolvedValue([row("a"), row("b"), row("c")]);
    const res = await GET(req("?limit=20&since=top"), { params });
    const body = await res.json();

    const args = mockImageFindMany.mock.calls[0]![0]!;
    expect(args.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(args.cursor).toEqual({ id: "top" });
    expect(body.images.map((i: { id: string }) => i.id)).toEqual(["c", "b", "a"]);
    expect(body.gap).toBe(false);
    expect(body.nextCursor).toBeUndefined();
  });

  it("since 指定で新着が1ページ超: gap=true", async () => {
    mockImageFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => row(`id${i}`)));
    const res = await GET(req("?limit=20&since=top"), { params });
    const body = await res.json();
    expect(body.gap).toBe(true);
  });
});
