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

function row(id: string, pinnedAt: Date | null = null) {
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
    pinnedAt,
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

  it("2ページ目(cursor): 降順カーソルで nextCursor/hasMore を返す", async () => {
    mockImageFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => row(`id${i}`)));
    const res = await GET(req("?limit=20&cursor=c0"), { params });
    const body = await res.json();

    const args = mockImageFindMany.mock.calls[0]![0]!;
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.cursor).toEqual({ id: "c0" });
    expect(body.images).toHaveLength(20);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe("id19");
  });

  it("先頭ページ: ピン留めを全件先頭に集約し、通常投稿を続ける", async () => {
    // 1回目=ピン留め（pinnedAt降順）、2回目=ピン留め除外の新着(limit+1件)。
    mockImageFindMany
      .mockResolvedValueOnce([
        row("p1", new Date("2026-07-10T00:00:00Z")),
        row("p2", new Date("2026-07-09T00:00:00Z")),
      ])
      .mockResolvedValueOnce(Array.from({ length: 21 }, (_, i) => row(`id${i}`)));
    const res = await GET(req("?limit=20"), { params });
    const body = await res.json();

    // ピン留めクエリ: pinnedAt not null / pinnedAt desc
    const pinArgs = mockImageFindMany.mock.calls[0]![0]!;
    expect(pinArgs.where).toMatchObject({ pinnedAt: { not: null } });
    expect(pinArgs.orderBy).toEqual({ pinnedAt: "desc" });
    // 通常投稿クエリ: ピン留めidを除外
    const recentArgs = mockImageFindMany.mock.calls[1]![0]!;
    expect(recentArgs.where).toMatchObject({ id: { notIn: ["p1", "p2"] } });

    // 先頭2件はピン留め、続けて新着20件（合計22件）
    expect(body.images.map((i: { id: string }) => i.id).slice(0, 2)).toEqual(["p1", "p2"]);
    expect(body.images).toHaveLength(22);
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
