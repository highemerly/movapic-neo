import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// prisma・Fediverse操作・sync・絵文字カタログはモック。キー正規化やマージなどの
// 純ロジックは本物を使う（境界だけ遮断する）。
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
  getCurrentUserWithValidation: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  default: {
    image: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/tokens", () => ({ decryptToken: vi.fn((t: string) => t) }));
vi.mock("@/lib/avatar", () => ({
  getAvatarUrl: vi.fn((u: string | null) => u),
  getEmojiImageUrl: vi.fn((u: string | null) => u),
  getReactionEmojiImageUrl: vi.fn((_emoji: string, u: string | null) => u),
}));
vi.mock("@/lib/reactions/customEmoji", () => ({ findShamezoEmoji: vi.fn() }));
vi.mock("@/lib/fediverse/favoriteSync", () => ({
  readCache: vi.fn(() => []),
  readTotalsCache: vi.fn(() => null),
  syncFavoriteCache: vi.fn(),
}));
vi.mock("@/lib/fediverse/favoritePolicy", () => ({ shouldSyncOnGet: vi.fn(() => false) }));
vi.mock("@/lib/fediverse/emojis", () => ({ getInstanceEmojiCatalog: vi.fn() }));
vi.mock("@/lib/queue", () => ({ enqueueFavoriteSync: vi.fn() }));
vi.mock("@/lib/notifications/favoriteNotifications", () => ({
  reconcileFavoriteNotificationSafely: vi.fn(),
}));
vi.mock("@/lib/achievements/reactionTriggers", () => ({
  onReactionGiven: vi.fn(),
  onReactionsReceived: vi.fn(),
}));
vi.mock("@/lib/reactions/store", () => ({
  loadStoredReactions: vi.fn(async () => []),
  setReaction: vi.fn(),
  clearReaction: vi.fn(),
}));
vi.mock("@/lib/fediverse/favorite", async (orig) => {
  const actual = await orig<typeof import("@/lib/fediverse/favorite")>();
  return { ...actual, sendReaction: vi.fn(), removeReaction: vi.fn() };
});

import { GET, PUT, DELETE } from "./route";
import { getCurrentUser, getCurrentUserWithValidation } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { readCache, readTotalsCache, syncFavoriteCache } from "@/lib/fediverse/favoriteSync";
import { shouldSyncOnGet } from "@/lib/fediverse/favoritePolicy";
import { getInstanceEmojiCatalog } from "@/lib/fediverse/emojis";
import { sendReaction, removeReaction, FavoriteError } from "@/lib/fediverse/favorite";
import { enqueueFavoriteSync } from "@/lib/queue";
import { reconcileFavoriteNotificationSafely } from "@/lib/notifications/favoriteNotifications";
import { onReactionGiven, onReactionsReceived } from "@/lib/achievements/reactionTriggers";
import { clearReaction, loadStoredReactions, setReaction } from "@/lib/reactions/store";
import { findShamezoEmoji } from "@/lib/reactions/customEmoji";
import { ErrorCodes } from "@/lib/errors";

const mockGetUser = vi.mocked(getCurrentUser);
const mockGetViewer = vi.mocked(getCurrentUserWithValidation);
const mockFindImage = vi.mocked(prisma.image.findUnique);
const mockUpdateImage = vi.mocked(prisma.image.update);
const mockReadCache = vi.mocked(readCache);
const mockReadTotals = vi.mocked(readTotalsCache);
const mockSync = vi.mocked(syncFavoriteCache);
const mockShouldSync = vi.mocked(shouldSyncOnGet);
const mockCatalog = vi.mocked(getInstanceEmojiCatalog);
const mockSend = vi.mocked(sendReaction);
const mockRemove = vi.mocked(removeReaction);
const mockEnqueue = vi.mocked(enqueueFavoriteSync);
const mockReconcile = vi.mocked(reconcileFavoriteNotificationSafely);
const mockLoadStored = vi.mocked(loadStoredReactions);
const mockSetReaction = vi.mocked(setReaction);
const mockClearReaction = vi.mocked(clearReaction);
const mockOnGiven = vi.mocked(onReactionGiven);
const mockOnReceived = vi.mocked(onReactionsReceived);

type ImageRow = Awaited<ReturnType<typeof prisma.image.findUnique>>;
const mockImage = (over: Record<string, unknown> = {}) =>
  ({
    id: "img1",
    userId: "owner-1",
    favoriteCount: 3,
    fediverseCount: 3,
    favoritesSyncedAt: null,
    postStatus: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    postId: "123",
    postUrl: "https://owner.example/@x/123",
    favoritersCache: [],
    reactionTotalsCache: null,
    user: { username: "owner", instance: { type: "mastodon", domain: "owner.example" } },
    ...over,
  }) as unknown as ImageRow;

type Viewer = Awaited<ReturnType<typeof getCurrentUserWithValidation>>;
const viewerOf = (type: "mastodon" | "misskey", over: Record<string, unknown> = {}) =>
  ({
    id: "user-1",
    username: "bob",
    displayName: "Bob",
    avatarUrl: null,
    accessToken: "enc",
    instance: { type, domain: "viewer.example" },
    ...over,
  }) as unknown as Viewer;

const syncResult = (over: Record<string, unknown> = {}) => ({
  count: 3,
  favoriters: [],
  fediverseCount: 3,
  totalsCache: null,
  errorReason: null,
  ...over,
});

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/v1/images/img1/reactions", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = { params: Promise.resolve({ id: "img1" }) };

async function json(res: Response): Promise<Record<string, unknown>> {
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockShouldSync.mockReturnValue(false);
  mockReadCache.mockReturnValue([]);
  mockReadTotals.mockReturnValue(null);
  mockLoadStored.mockResolvedValue([]);
  mockSync.mockResolvedValue(syncResult());
});

describe("GET /api/v1/images/[id]/reactions", () => {
  it("画像が無ければ 404", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindImage.mockResolvedValue(null);
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(404);
    expect(((await json(res)).error as { code: string }).code).toBe(ErrorCodes.NOT_FOUND);
  });

  it("TTL有効なら sync せずキャッシュからチップを組む", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindImage.mockResolvedValue(mockImage({ fediverseCount: 7 }));

    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    const body = await json(res);
    expect(mockSync).not.toHaveBeenCalled();
    // 種別を持たない旧キャッシュは ❤ 1チップにまとまる
    expect(body.chips).toEqual([
      { emoji: "❤", imageUrl: null, count: 7, reactedByViewer: false },
    ]);
    expect(body.total).toBe(7);
    expect(body.reactable).toBe(true);
    expect(body.fediverseSendable).toBe(true);
  });

  it("TTL切れなら sync し、その結果でチップを組む", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindImage.mockResolvedValue(mockImage());
    mockShouldSync.mockReturnValue(true);
    mockSync.mockResolvedValue(
      syncResult({
        fediverseCount: 4,
        totalsCache: { totals: { "👍": 3, "🎉": 1 }, emojiUrls: {} },
      })
    );

    const body = await json(await GET(req("GET"), ctx));
    expect(mockSync).toHaveBeenCalledTimes(1);
    // 閲覧時の同期はオーナー側の取り消しも反映する（定期だけでは day1/day14 の2回しか回らない）
    expect(mockSync).toHaveBeenCalledWith(expect.anything(), { reconcileRemovals: true });
    expect(body.chips).toEqual([
      { emoji: "👍", imageUrl: null, count: 3, reactedByViewer: false },
      { emoji: "🎉", imageUrl: null, count: 1, reactedByViewer: false },
    ]);
    expect(body.total).toBe(4);
  });

  it("local投稿（postIdなし）でもリアクション可能として返す", async () => {
    mockGetUser.mockResolvedValue(null);
    mockFindImage.mockResolvedValue(
      mockImage({ postId: null, postUrl: null, fediverseCount: 0 })
    );
    mockLoadStored.mockResolvedValue([
      {
        acct: "carol@viewer.example",
        displayName: "Carol",
        avatarUrl: null,
        profileUrl: null,
        emoji: "🎉",
        emojiImageUrl: null,
      },
    ]);

    const body = await json(await GET(req("GET"), ctx));
    expect(body.reactable).toBe(true);
    expect(body.fediverseSendable).toBe(false);
    expect(mockSync).not.toHaveBeenCalled();
    expect(body.total).toBe(1);
    expect(body.chips).toEqual([
      { emoji: "🎉", imageUrl: null, count: 1, reactedByViewer: false },
    ]);
  });

  it("閲覧者のリアクションを viewerEmoji として返す", async () => {
    mockGetUser.mockResolvedValue(viewerOf("misskey"));
    mockFindImage.mockResolvedValue(mockImage({ fediverseCount: 0 }));
    mockLoadStored.mockResolvedValue([
      {
        acct: "bob@viewer.example",
        displayName: "Bob",
        avatarUrl: null,
        profileUrl: null,
        emoji: "👍",
        emojiImageUrl: null,
      },
    ]);

    const body = await json(await GET(req("GET"), ctx));
    expect(body.viewerEmoji).toBe("👍");
    expect((body.chips as Array<{ reactedByViewer: boolean }>)[0].reactedByViewer).toBe(true);
    expect(
      (body.usersByEmoji as Record<string, Array<{ acct: string }>>)["👍"].map((u) => u.acct)
    ).toEqual(["bob@viewer.example"]);
  });
});

describe("PUT /api/v1/images/[id]/reactions - 絵文字の検証", () => {
  beforeEach(() => {
    mockFindImage.mockResolvedValue(mockImage());
    mockSend.mockResolvedValue({ reacted: true, count: 1 });
  });

  it("未ログインは 401", async () => {
    mockGetViewer.mockResolvedValue(null);
    const res = await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(res.status).toBe(401);
  });

  it("絵文字の指定が無ければ 400", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("misskey"));
    const res = await PUT(req("PUT", {}), ctx);
    expect(res.status).toBe(400);
    expect(mockSetReaction).not.toHaveBeenCalled();
  });

  it("Mastodonユーザーは任意のUnicode絵文字を使える（絵文字でない文字列は弾く）", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("mastodon"));

    const ng = await PUT(req("PUT", { emoji: "いいね" }), ctx);
    expect(ng.status).toBe(400);
    expect(mockSetReaction).not.toHaveBeenCalled();

    const ok = await PUT(req("PUT", { emoji: "🍣" }), ctx);
    expect(ok.status).toBe(200);
    expect(mockSetReaction).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: "🍣", emojiImageUrl: null })
    );
  });

  it("Mastodonユーザーはインスタンスのカスタム絵文字を使えない", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("mastodon"));
    const res = await PUT(req("PUT", { emoji: ":ai:" }), ctx);
    expect(res.status).toBe(400);
  });

  it("Mastodonユーザーは SHAMEZO 独自絵文字を実在確認して保存する（連合へは送らない）", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("mastodon"));
    vi.mocked(findShamezoEmoji).mockResolvedValue({
      name: "wktk",
      imageUrl: "https://s3.example/emoji/wktk.png",
      category: null,
      aliases: [],
    });

    const res = await PUT(req("PUT", { emoji: ":wktk@shamezo:" }), ctx);
    expect(res.status).toBe(200);
    expect(mockSetReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        emoji: ":wktk@shamezo:",
        emojiImageUrl: "https://s3.example/emoji/wktk.png",
      })
    );
    // Mastodon は絵文字によらず favourite(❤) を送る（SHAMEZO 絵文字は連合に送れない）
    expect(mockSend).toHaveBeenCalledWith(expect.anything(), ":wktk@shamezo:");
  });

  it("存在しない SHAMEZO 絵文字は 400", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("mastodon"));
    vi.mocked(findShamezoEmoji).mockResolvedValue(null);
    const res = await PUT(req("PUT", { emoji: ":nope@shamezo:" }), ctx);
    expect(res.status).toBe(400);
    expect(mockSetReaction).not.toHaveBeenCalled();
  });

  it("Misskeyユーザーは SHAMEZO 絵文字を使えない", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("misskey"));
    const res = await PUT(req("PUT", { emoji: ":wktk@shamezo:" }), ctx);
    expect(res.status).toBe(400);
    expect(mockSetReaction).not.toHaveBeenCalled();
  });

  it("Misskeyユーザーは絵文字でない文字列を弾く", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("misskey"));
    const res = await PUT(req("PUT", { emoji: "いいね" }), ctx);
    expect(res.status).toBe(400);
    expect(mockSetReaction).not.toHaveBeenCalled();
  });

  it("Misskeyユーザーの自サーバーのカスタム絵文字はカタログで実在確認して保存する", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("misskey"));
    mockCatalog.mockResolvedValue({
      emojis: [],
      byName: new Map([
        ["ai", { name: "ai", url: "https://viewer.example/emoji/ai.webp", category: null, aliases: [] }],
      ]),
    });

    const res = await PUT(req("PUT", { emoji: ":ai:" }), ctx);
    expect(res.status).toBe(200);
    // ホストを補った完全修飾キーで保存する
    expect(mockSetReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        emoji: ":ai@viewer.example:",
        emojiImageUrl: "https://viewer.example/emoji/ai.webp",
      })
    );
    // Fediverseへもその絵文字を送る
    expect(mockSend).toHaveBeenCalledWith(expect.anything(), ":ai@viewer.example:");
  });

  it("カタログに無いカスタム絵文字は 400", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("misskey"));
    mockCatalog.mockResolvedValue({ emojis: [], byName: new Map() });
    const res = await PUT(req("PUT", { emoji: ":nope:" }), ctx);
    expect(res.status).toBe(400);
  });

  it("他サーバーのカスタム絵文字は 400（Misskeyでも押せないため）", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("misskey"));
    const res = await PUT(req("PUT", { emoji: ":ai@other.example:" }), ctx);
    expect(res.status).toBe(400);
    expect(mockCatalog).not.toHaveBeenCalled();
  });

  it("異体字セレクタを落とした正規化キーで保存する", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("mastodon"));
    await PUT(req("PUT", { emoji: "❤️" }), ctx);
    expect(mockSetReaction).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: "❤" })
    );
  });
});

describe("PUT/DELETE /api/v1/images/[id]/reactions - 反映先", () => {
  beforeEach(() => {
    mockGetViewer.mockResolvedValue(viewerOf("misskey"));
    mockSend.mockResolvedValue({ reacted: true, count: 1 });
    mockRemove.mockResolvedValue({ reacted: false, count: 0 });
  });

  it("Fediverse送信に失敗したらDBに書かない", async () => {
    mockFindImage.mockResolvedValue(mockImage());
    mockSend.mockRejectedValue(new FavoriteError("deleted", 404));

    const res = await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(res.status).toBe(404);
    expect(mockSetReaction).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("local投稿はFediverseへ送らずDBだけに記録し、合計と通知を自分で更新する", async () => {
    mockFindImage.mockResolvedValue(
      mockImage({ postId: null, postUrl: null, fediverseCount: 0 })
    );
    mockLoadStored.mockResolvedValue([
      {
        acct: "bob@viewer.example",
        displayName: "Bob",
        avatarUrl: null,
        profileUrl: null,
        emoji: "👍",
        emojiImageUrl: null,
      },
    ]);

    const res = await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockSetReaction).toHaveBeenCalledTimes(1);
    expect(mockSync).not.toHaveBeenCalled();
    // 同期が走らないので合計の保存はルートの責任
    expect(mockUpdateImage).toHaveBeenCalledWith({
      where: { id: "img1" },
      data: { favoriteCount: 1 },
    });
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });

  // Mastodon は絵文字を連合送信できないので「変更だけなら送らない」最適化ができそうに見えるが、
  // DB行の存在は相手サーバーに favourite が残っている保証にならない（route.ts の pitfall 参照）。
  it("Mastodonユーザーの絵文字変更でもfavouriteを送り直す", async () => {
    mockGetViewer.mockResolvedValue(viewerOf("mastodon"));
    mockFindImage.mockResolvedValue(mockImage());

    const res = await PUT(req("PUT", { emoji: "🎉" }), ctx);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith(expect.anything(), "🎉");
    expect(mockSetReaction).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: "🎉" })
    );
  });

  it("Misskeyユーザーの絵文字変更はリアクションを送り直す（付け替え）", async () => {
    mockFindImage.mockResolvedValue(mockImage());

    await PUT(req("PUT", { emoji: "🎉" }), ctx);
    expect(mockSend).toHaveBeenCalledWith(expect.anything(), "🎉");
  });

  it("DELETE はFediverseの解除とDB削除を行う", async () => {
    mockFindImage.mockResolvedValue(mockImage());

    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockClearReaction).toHaveBeenCalledWith("img1", "user-1");
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("押した側の実績評価はDB記録後に走る（解除では走らない）", async () => {
    mockFindImage.mockResolvedValue(mockImage());

    await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(mockOnGiven).toHaveBeenCalledWith("user-1", "img1");

    mockOnGiven.mockClear();
    await DELETE(req("DELETE"), ctx);
    expect(mockOnGiven).not.toHaveBeenCalled();
  });

  it("local投稿は受け取り側の実績評価も自分で行う（同期が走らないため）", async () => {
    mockFindImage.mockResolvedValue(
      mockImage({ postId: null, postUrl: null, fediverseCount: 0, favoriteCount: 0 })
    );
    mockLoadStored.mockResolvedValue([
      {
        acct: "bob@viewer.example",
        displayName: "Bob",
        avatarUrl: null,
        profileUrl: null,
        emoji: "👍",
        emojiImageUrl: null,
      },
    ]);

    await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(mockOnReceived).toHaveBeenCalledWith({
      ownerUserId: "owner-1",
      imageId: "img1",
      previousCount: 0,
      currentCount: 1,
    });
  });

  it("操作直後のsyncは取り消し反映を行わない（自分の操作を誤検知するため）", async () => {
    mockFindImage.mockResolvedValue(mockImage());

    await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(mockSync).toHaveBeenCalledWith(expect.anything());
  });

  it("即時syncに操作が載っていなければ遅延syncを積む", async () => {
    mockFindImage.mockResolvedValue(mockImage());
    mockSync.mockResolvedValue(syncResult({ favoriters: [] }));

    await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(mockEnqueue).toHaveBeenCalledWith({
      imageId: "img1",
      viewerAcct: "bob@viewer.example",
      favourited: true,
    });
  });

  it("即時syncに載っていれば遅延syncは積まない", async () => {
    mockFindImage.mockResolvedValue(mockImage());
    mockSync.mockResolvedValue(
      syncResult({
        favoriters: [
          {
            acct: "bob@viewer.example",
            displayName: "Bob",
            avatarUrl: null,
            profileUrl: null,
            emoji: "👍",
            emojiImageUrl: null,
          },
        ],
      })
    );

    await PUT(req("PUT", { emoji: "👍" }), ctx);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
