import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（DB・アバターURL整形）を先頭でモックして外部を一切読ませない。
vi.mock("@/lib/db", () => ({
  default: { image: { findMany: vi.fn() } },
}));
vi.mock("@/lib/avatar", () => ({ getAvatarUrl: (v: string | null) => v ?? "" }));

import { GET } from "./route";
import prisma from "@/lib/db";

const mockFindMany = vi.mocked(prisma.image.findMany);

// PUBLIC_IMAGE_LIST_SELECT の最小行を作る。createdAt は toISOString を呼ぶため Date。
function row(id: string) {
  return {
    id,
    storageKey: `k/${id}`,
    width: 100,
    height: 100,
    overlayText: "",
    altText: null,
    position: "bottom",
    size: "medium",
    blurDataUrl: null,
    favoriteCount: 0,
    createdAt: new Date("2026-07-15T00:00:00Z"),
    user: {
      username: "alice",
      displayName: "Alice",
      avatarUrl: null,
      instance: { domain: "handon.club" },
    },
  } as unknown as Awaited<ReturnType<typeof prisma.image.findMany>>[number];
}

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/public/timeline${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/public/timeline", () => {
  it("通常ページ: 降順カーソルで取得し nextCursor/hasMore を返す", async () => {
    // limit+1(=21) 件返して hasMore=true を検証（末尾1件を落とす）。
    mockFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => row(`id${i}`)));
    const res = await GET(req("?limit=20"));
    const body = await res.json();

    const args = mockFindMany.mock.calls[0]![0]!;
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(21);
    expect(body.images).toHaveLength(20);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe("id19");
    expect(body.gap).toBeUndefined();
  });

  it("since 指定: 昇順カーソルで since より新しい画像だけを新しい順に返す", async () => {
    // 昇順（古い→新しい）で3件 → 反転して新しい順に返る。
    mockFindMany.mockResolvedValue([row("a"), row("b"), row("c")]);
    const res = await GET(req("?limit=20&since=top"));
    const body = await res.json();

    const args = mockFindMany.mock.calls[0]![0]!;
    expect(args.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(args.cursor).toEqual({ id: "top" });
    expect(args.skip).toBe(1);
    expect(body.images.map((i: { id: string }) => i.id)).toEqual(["c", "b", "a"]);
    expect(body.gap).toBe(false);
    // 差分応答は nextCursor を持たない（無限スクロール末尾は触らない）。
    expect(body.nextCursor).toBeUndefined();
  });

  it("since 指定で新着が1ページ超: gap=true（クライアントは全差し替えにフォールバック）", async () => {
    mockFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => row(`id${i}`)));
    const res = await GET(req("?limit=20&since=top"));
    const body = await res.json();
    expect(body.gap).toBe(true);
  });

  it("instances 絞り込みを where に反映する", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(req("?instances=handon.club,example.com"));
    const args = mockFindMany.mock.calls[0]![0]!;
    expect(args.where!.user).toEqual({
      instance: { domain: { in: ["handon.club", "example.com"] } },
    });
  });
});
