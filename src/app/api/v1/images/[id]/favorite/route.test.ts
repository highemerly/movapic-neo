import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// prisma・Fediverse操作・sync はモック。分類/メッセージ等の純ヘルパは本物を使う（部分モック）。
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
  getCurrentUserWithValidation: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: { image: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/tokens", () => ({ decryptToken: vi.fn((t: string) => t) }));
vi.mock("@/lib/avatar", () => ({ getAvatarUrl: vi.fn((u: string | null) => u) }));
vi.mock("@/lib/fediverse/favoriteSync", () => ({
  readCache: vi.fn(() => []),
  syncFavoriteCache: vi.fn(),
}));
vi.mock("@/lib/fediverse/favoritePolicy", () => ({ shouldSyncOnGet: vi.fn(() => false) }));
vi.mock("@/lib/queue", () => ({ enqueueFavoriteSync: vi.fn() }));
vi.mock("@/lib/fediverse/favorite", async (orig) => {
  const actual = await orig<typeof import("@/lib/fediverse/favorite")>();
  return { ...actual, favoriteStatus: vi.fn(), unfavoriteStatus: vi.fn() };
});

import { GET, POST, DELETE } from "./route";
import { getCurrentUser, getCurrentUserWithValidation } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { readCache, syncFavoriteCache } from "@/lib/fediverse/favoriteSync";
import { shouldSyncOnGet } from "@/lib/fediverse/favoritePolicy";
import { favoriteStatus, unfavoriteStatus, FavoriteError } from "@/lib/fediverse/favorite";
import { enqueueFavoriteSync } from "@/lib/queue";
import { ErrorCodes } from "@/lib/errors";

const mockGetUser = vi.mocked(getCurrentUser);
const mockGetViewer = vi.mocked(getCurrentUserWithValidation);
const mockFindUnique = vi.mocked(prisma.image.findUnique);
const mockReadCache = vi.mocked(readCache);
const mockSync = vi.mocked(syncFavoriteCache);
const mockShouldSync = vi.mocked(shouldSyncOnGet);
const mockFavorite = vi.mocked(favoriteStatus);
const mockUnfavorite = vi.mocked(unfavoriteStatus);
const mockEnqueueSync = vi.mocked(enqueueFavoriteSync);

type ImageRow = Awaited<ReturnType<typeof prisma.image.findUnique>>;
const mockImage = (over: Record<string, unknown> = {}) =>
  ({
    id: "img1",
    favoriteCount: 3,
    favoritesSyncedAt: null,
    postStatus: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    postId: "123",
    postUrl: "https://owner.example/@x/123",
    favoritersCache: [],
    user: { instance: { type: "mastodon", domain: "owner.example" } },
    ...over,
  }) as unknown as ImageRow;

type Viewer = Awaited<ReturnType<typeof getCurrentUserWithValidation>>;
const VIEWER = {
  username: "bob",
  displayName: "Bob",
  avatarUrl: null,
  accessToken: "enc",
  instance: { type: "mastodon", domain: "viewer.example" },
} as unknown as Viewer;

const req = (method: string) =>
  new NextRequest("http://localhost/api/v1/images/img1/favorite", { method });
const ctx = { params: Promise.resolve({ id: "img1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockShouldSync.mockReturnValue(false);
  mockReadCache.mockReturnValue([]);
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return res.json();
}

describe("GET /api/v1/images/[id]/favorite", () => {
  it("画像が無ければ 404", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(404);
    expect(((await json(res)).error as { code: string }).code).toBe(ErrorCodes.NOT_FOUND);
  });

  it("TTL有効なら sync せずキャッシュを返す（Cache-Control付き）", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(mockImage({ favoriteCount: 7 }));
    mockShouldSync.mockReturnValue(false);

    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    const b = await json(res);
    expect(b.success).toBe(true);
    expect(b.favoritable).toBe(true);
    expect(b.favoriteCount).toBe(7);
    expect(b.isFavorited).toBe(false);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("TTL切れなら syncFavoriteCache の結果で上書きする", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(mockImage({ favoriteCount: 3 }));
    mockShouldSync.mockReturnValue(true);
    mockSync.mockResolvedValue({ count: 42, favoriters: [], errorReason: null });

    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect((await json(res)).favoriteCount).toBe(42);
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("viewerのacctがキャッシュにあれば isFavorited=true", async () => {
    mockGetUser.mockResolvedValue({
      username: "bob",
      instance: { domain: "viewer.example" },
    } as unknown as Awaited<ReturnType<typeof getCurrentUser>>);
    mockFindUnique.mockResolvedValue(mockImage());
    mockReadCache.mockReturnValue([
      { acct: "bob@viewer.example", displayName: "Bob", avatarUrl: null, profileUrl: "https://viewer.example/@bob" },
    ]);

    const res = await GET(req("GET"), ctx);
    expect((await json(res)).isFavorited).toBe(true);
  });

  it("local投稿（postIdなし）は favoritable=false・sync しない", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(mockImage({ postId: null }));
    mockShouldSync.mockReturnValue(true); // それでも favoritable=false なので sync 分岐に入らない

    const res = await GET(req("GET"), ctx);
    expect((await json(res)).favoritable).toBe(false);
    expect(mockSync).not.toHaveBeenCalled();
  });
});

describe("POST/DELETE（お気に入りトグル）", () => {
  it("未認証は 401", async () => {
    mockGetViewer.mockResolvedValue(null);
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(401);
    expect(((await json(res)).error as { code: string }).code).toBe(ErrorCodes.AUTH_REQUIRED);
  });

  it("画像が無ければ 404", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(404);
  });

  it("お気に入り不可（local投稿）は 400", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(mockImage({ postId: null }));
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(400);
    expect(((await json(res)).error as { code: string }).code).toBe(ErrorCodes.VALIDATION_INVALID);
  });

  it("viewerがMastodon/Misskey以外なら 400", async () => {
    mockGetViewer.mockResolvedValue({
      ...VIEWER,
      instance: { type: "other", domain: "viewer.example" },
    } as unknown as Viewer);
    mockFindUnique.mockResolvedValue(mockImage());
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(400);
  });

  it("POST 成功: favoriteStatus を復号トークン付きで呼び 200 を返す。即時syncし、未反映なら遅延syncを積む", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(mockImage());
    mockFavorite.mockResolvedValue({ favourited: true, count: 5 });
    // 即時syncでは viewer がまだオーナー側に載っていない（連合前）
    mockSync.mockResolvedValue({ count: 5, favoriters: [], errorReason: null });

    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(200);
    const b = await json(res);
    expect(b.success).toBe(true);
    expect(b.isFavorited).toBe(true);
    expect(b.favoriteCount).toBe(5);
    expect(mockFavorite.mock.calls[0][0]).toMatchObject({
      viewerType: "mastodon",
      viewerToken: "enc",
      ownerDomain: "owner.example",
      postId: "123",
    });
    // 即時sync（同一インスタンス/速い連合の即時反映のため）は必ず呼ぶ
    expect(mockSync).toHaveBeenCalledTimes(1);
    // 未反映なので反映確認つき遅延 sync を viewer の acct・favourited=true で積む
    expect(mockEnqueueSync).toHaveBeenCalledWith({
      imageId: "img1",
      viewerAcct: "bob@viewer.example",
      favourited: true,
    });
  });

  it("POST 成功: 即時syncで既に反映済みなら遅延syncは積まない", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(mockImage());
    mockFavorite.mockResolvedValue({ favourited: true, count: 3 });
    // 即時syncで viewer が既にオーナー側 favourited_by に載っている（同一インスタンス等）
    mockSync.mockResolvedValue({
      count: 3,
      favoriters: [
        { acct: "bob@viewer.example", displayName: "Bob", avatarUrl: null, profileUrl: "https://viewer.example/@bob" },
      ],
      errorReason: null,
    });

    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSync).not.toHaveBeenCalled();
    // 応答一覧は即時syncの結果（viewer 込み）
    const favoriters = (await json(res)).favoriters as Array<{ acct: string }>;
    expect(favoriters.map((f) => f.acct)).toEqual(["bob@viewer.example"]);
  });

  it("DELETE 成功: unfavoriteStatus を呼び isFavorited=false。未反映（まだ載っている）なら遅延syncを積む", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(mockImage());
    mockUnfavorite.mockResolvedValue({ favourited: false, count: 4 });
    // 即時syncでは viewer がまだオーナー側に残っている（連合前）→ unfav 未反映
    mockSync.mockResolvedValue({
      count: 5,
      favoriters: [
        { acct: "bob@viewer.example", displayName: "Bob", avatarUrl: null, profileUrl: "https://viewer.example/@bob" },
      ],
      errorReason: null,
    });

    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(200);
    const b = await json(res);
    expect(b.isFavorited).toBe(false);
    expect(b.favoriteCount).toBe(4);
    expect(mockUnfavorite).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockEnqueueSync).toHaveBeenCalledWith({
      imageId: "img1",
      viewerAcct: "bob@viewer.example",
      favourited: false,
    });
    // 応答一覧では viewer を取り除いて返す（即時反映）
    const favoriters = b.favoriters as Array<{ acct: string }>;
    expect(favoriters.map((f) => f.acct)).toEqual([]);
  });

  it("DELETE 成功: 即時syncで既に消えていれば遅延syncは積まない", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(mockImage());
    mockUnfavorite.mockResolvedValue({ favourited: false, count: 2 });
    // 即時syncで viewer が既に居ない（同一インスタンス等）→ unfav 反映済み
    mockSync.mockResolvedValue({ count: 2, favoriters: [], errorReason: null });

    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(mockEnqueueSync).not.toHaveBeenCalled();
  });

  it("enqueue 失敗でも操作は成功として 200 を返す（Fediverse 操作は成功済み・二重トグル回避）", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(mockImage());
    mockFavorite.mockResolvedValue({ favourited: true, count: 5 });
    mockSync.mockResolvedValue({ count: 5, favoriters: [], errorReason: null });
    mockEnqueueSync.mockRejectedValueOnce(new Error("db down"));

    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(200);
    expect((await json(res)).isFavorited).toBe(true);
  });

  it("FavoriteError(deleted) は 404、(forbidden) は 403、想定外は 502", async () => {
    mockGetViewer.mockResolvedValue(VIEWER);
    mockFindUnique.mockResolvedValue(mockImage());

    mockFavorite.mockRejectedValueOnce(new FavoriteError("deleted", 404));
    expect((await POST(req("POST"), ctx)).status).toBe(404);

    mockFavorite.mockRejectedValueOnce(new FavoriteError("forbidden", 403));
    expect((await POST(req("POST"), ctx)).status).toBe(403);

    mockFavorite.mockRejectedValueOnce(new Error("connect timeout"));
    expect((await POST(req("POST"), ctx)).status).toBe(502);
  });
});
