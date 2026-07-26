/**
 * syncFavoriteCache のユニットテスト。
 *
 * 実 Fediverse には出さず、ネットワーク層（fetchFavoriteData）と prisma、通知差分を
 * モックして「取得結果（HTTPステータス）→ DB更新 / 返り値 / 通知」の対応を検証する。
 *
 * この同期エンジンは3つの実行経路すべてが共通で呼ぶ:
 *   - GET（TTL切れ時）… route.ts
 *   - POST/DELETE（操作直後・TTL無関係に必ず）… route.ts
 *   - 定期フォールバック（isFavoriteSyncDue が真のとき）… periodic/index.ts
 * よって「200/404/429/504 のときどうなるか」はここで一括検証すれば全経路に効く。
 * 「いつ呼ぶか（TTL内/外）」の判定は純粋関数側（favoritePolicy.test.ts）で検証する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock 関数は vi.hoisted で先に生成する。
const {
  imageUpdate,
  reactionFindMany,
  reactionDeleteMany,
  fetchFavoriteDataMock,
  reconcileMock,
  resolveLocalEmojiUrlsMock,
} = vi.hoisted(() => ({
  imageUpdate: vi.fn(),
  reactionFindMany: vi.fn(),
  reactionDeleteMany: vi.fn(),
  fetchFavoriteDataMock: vi.fn(),
  reconcileMock: vi.fn(),
  resolveLocalEmojiUrlsMock: vi.fn(),
}));

// prisma は image.update と reaction.findMany（マージ／取り消し検知）・reaction.deleteMany
// （取り消し反映）を使う
vi.mock("@/lib/db", () => ({
  default: {
    image: { update: imageUpdate },
    reaction: { findMany: reactionFindMany, deleteMany: reactionDeleteMany },
  },
}));

// ネットワーク層は fetchFavoriteData のみ差し替え、FavoriteError/分類ヘルパは実物を使う
vi.mock("@/lib/fediverse/favorite", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/fediverse/favorite")>();
  return { ...actual, fetchFavoriteData: fetchFavoriteDataMock };
});

// カスタム絵文字URLの解決はカタログ取得（ネットワーク＋DB）なのでここでは遮断する
vi.mock("@/lib/fediverse/emojis", () => ({
  resolveLocalEmojiUrls: resolveLocalEmojiUrlsMock,
}));

// 通知差分の中身は favoriteNotifications 側の責務。ここでは呼び出し有無・wasFirstSync だけ見る
vi.mock("@/lib/notifications/favoriteNotifications", () => ({
  reconcileFavoriteNotificationSafely: reconcileMock,
}));

import { FavoriteError, type CachedFavoriter } from "@/lib/fediverse/favorite";
import { syncFavoriteCache, type ImageForFavorite } from "@/lib/fediverse/favoriteSync";

const FAV = (acct: string, emoji = "❤"): CachedFavoriter => ({
  acct,
  displayName: null,
  avatarUrl: null,
  profileUrl: null,
  emoji,
  emojiImageUrl: null,
});

/** fetchFavoriteData の戻り値。Mastodonオーナー相当（種別を持たないので ❤ に寄る） */
function favoriteData(count: number, favoriters: CachedFavoriter[]) {
  return {
    count,
    favoriters,
    totals: count > 0 ? { "❤": count } : {},
    emojiUrls: {},
  };
}

function makeImage(over: Partial<Record<string, unknown>> = {}): ImageForFavorite {
  return {
    id: "img-1",
    postId: "note-1",
    userId: "user-1",
    favoriteCount: 5,
    fediverseCount: 5,
    favoritersCache: [FAV("old@x")],
    favoritesSyncedAt: null,
    postStatus: null,
    isPublic: true,
    isDisabled: false,
    createdAt: new Date("2026-06-20T00:00:00Z"),
    user: { username: "owner", instance: { type: "mastodon", domain: "owner.example" } },
    ...over,
  } as unknown as ImageForFavorite;
}

/** imageUpdate に渡された data オブジェクト（最後の呼び出し）。 */
function lastUpdateData(): Record<string, unknown> {
  const call = imageUpdate.mock.calls.at(-1);
  return (call?.[0] as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  imageUpdate.mockReset().mockResolvedValue({});
  reactionFindMany.mockReset().mockResolvedValue([]);
  reactionDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  fetchFavoriteDataMock.mockReset();
  reconcileMock.mockReset().mockResolvedValue(undefined);
  resolveLocalEmojiUrlsMock.mockReset().mockResolvedValue({});
});

describe("syncFavoriteCache - ステータス別の結果（3経路共通の同期エンジン）", () => {
  it("200成功: count/cache/postStatus=200/syncedAt を更新し、取得値を返す", async () => {
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(3, [FAV("a@x")]));
    const res = await syncFavoriteCache(makeImage({ favoritersCache: [], postStatus: null }));

    expect(res).toMatchObject({ count: 3, favoriters: [FAV("a@x")], errorReason: null });
    const data = lastUpdateData();
    expect(data.favoriteCount).toBe(3);
    expect(data.favoritersCache).toEqual([FAV("a@x")]);
    expect(data.postStatus).toBe(200);
    expect(data.favoritesSyncedAt).toBeInstanceOf(Date);
    // 成功時は通知差分を回す
    expect(reconcileMock).toHaveBeenCalledTimes(1);
  });

  it("404 deleted: postStatus=404/syncedAt のみ更新、旧キャッシュを返す（count/cacheは触らない）", async () => {
    fetchFavoriteDataMock.mockRejectedValue(new FavoriteError("deleted", 404));
    const res = await syncFavoriteCache(makeImage({ favoriteCount: 5, favoritersCache: [FAV("old@x")] }));

    expect(res).toMatchObject({ count: 5, favoriters: [FAV("old@x")], errorReason: "deleted" });
    const data = lastUpdateData();
    expect(data.postStatus).toBe(404);
    expect(data.favoritesSyncedAt).toBeInstanceOf(Date);
    expect(data.favoriteCount).toBeUndefined();
    expect(data.favoritersCache).toBeUndefined();
    // 失敗時は通知差分を回さない
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("429: postStatus=429・errorReason=unavailable（一時障害）", async () => {
    fetchFavoriteDataMock.mockRejectedValue(new FavoriteError("unavailable", 429));
    const res = await syncFavoriteCache(makeImage());

    expect(res.errorReason).toBe("unavailable");
    expect(lastUpdateData().postStatus).toBe(429);
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("504(5xx): postStatus=504・errorReason=unavailable（一時障害）", async () => {
    fetchFavoriteDataMock.mockRejectedValue(new FavoriteError("unavailable", 504));
    const res = await syncFavoriteCache(makeImage());

    expect(res.errorReason).toBe("unavailable");
    expect(lastUpdateData().postStatus).toBe(504);
  });
});

describe("syncFavoriteCache - throw しない契約（POST/DELETE の 500→二重トグル防止の要）", () => {
  it("タイムアウト等の非FavoriteError: postStatus=0・errorReason=unavailable で throw しない", async () => {
    fetchFavoriteDataMock.mockRejectedValue(new Error("The operation was aborted (timeout)"));
    const res = await syncFavoriteCache(makeImage({ favoriteCount: 9, favoritersCache: [FAV("keep@x")] }));

    expect(res).toMatchObject({ count: 9, favoriters: [FAV("keep@x")], errorReason: "unavailable" });
    expect(lastUpdateData().postStatus).toBe(0);
  });

  it("成功パスで DB 永続化が失敗しても throw せず取得値を返し、通知差分はスキップ", async () => {
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(3, [FAV("a@x")]));
    imageUpdate.mockRejectedValue(new Error("db down"));

    const res = await syncFavoriteCache(makeImage());
    expect(res).toMatchObject({ count: 3, favoriters: [FAV("a@x")], errorReason: null });
    // 永続化できていないので誤通知を避けるため差分はスキップ
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("失敗パスで失敗状態の永続化が失敗しても throw しない", async () => {
    fetchFavoriteDataMock.mockRejectedValue(new FavoriteError("unavailable", 429));
    imageUpdate.mockRejectedValue(new Error("db down"));

    const res = await syncFavoriteCache(makeImage({ favoriteCount: 7, favoritersCache: [FAV("keep@x")] }));
    expect(res).toMatchObject({ count: 7, favoriters: [FAV("keep@x")], errorReason: "unavailable" });
  });
});

describe("syncFavoriteCache - リアクション（絵文字別カウントと SHAMEZO 側の重ね合わせ）", () => {
  it("絵文字別カウントと生の合計を別々に保存する", async () => {
    fetchFavoriteDataMock.mockResolvedValue({
      count: 5,
      favoriters: [FAV("a@x", "👍"), FAV("b@x", ":ai@owner.example:")],
      totals: { "👍": 3, ":ai@owner.example:": 2 },
      emojiUrls: {},
    });
    const res = await syncFavoriteCache(makeImage({ favoritersCache: [], postStatus: 200 }));

    const data = lastUpdateData();
    expect(data.fediverseCount).toBe(5);
    expect(data.favoriteCount).toBe(5);
    expect(data.reactionTotalsCache).toEqual({
      totals: { "👍": 3, ":ai@owner.example:": 2 },
      emojiUrls: {},
    });
    expect(res.count).toBe(5);
  });

  it("オーナーのローカル絵文字URLをカタログから補い、キャッシュにも焼き込む", async () => {
    resolveLocalEmojiUrlsMock.mockResolvedValue({
      ":ai@owner.example:": "https://owner.example/emoji/ai.webp",
    });
    fetchFavoriteDataMock.mockResolvedValue({
      count: 1,
      favoriters: [FAV("a@x", ":ai@owner.example:")],
      totals: { ":ai@owner.example:": 1 },
      emojiUrls: {},
    });
    await syncFavoriteCache(makeImage({ favoritersCache: [], postStatus: 200 }));

    const data = lastUpdateData();
    expect(data.reactionTotalsCache).toEqual({
      totals: { ":ai@owner.example:": 1 },
      emojiUrls: { ":ai@owner.example:": "https://owner.example/emoji/ai.webp" },
    });
    expect((data.favoritersCache as CachedFavoriter[])[0].emojiImageUrl).toBe(
      "https://owner.example/emoji/ai.webp"
    );
  });

  it("カタログ取得に失敗しても同期は続行する（URLが付かないだけ）", async () => {
    resolveLocalEmojiUrlsMock.mockRejectedValue(new Error("catalog down"));
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(2, [FAV("a@x")]));

    const res = await syncFavoriteCache(makeImage({ postStatus: 200 }));
    expect(res.errorReason).toBeNull();
    expect(lastUpdateData().favoriteCount).toBe(2);
  });

  it("連合に載らない SHAMEZO 上のリアクションを合計に足して favoriteCount に保存する", async () => {
    reactionFindMany.mockResolvedValue([
      {
        emoji: "🎉",
        emojiImageUrl: null,
        user: {
          username: "local",
          displayName: null,
          avatarUrl: null,
          instance: { domain: "shamezo.example" },
        },
      },
    ]);
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(2, [FAV("a@x"), FAV("b@x")]));

    const res = await syncFavoriteCache(makeImage({ postStatus: 200 }));

    // 連合の2件 + キャッシュに居ないSHAMEZOの1件
    expect(lastUpdateData().favoriteCount).toBe(3);
    expect(lastUpdateData().fediverseCount).toBe(2);
    expect(res.count).toBe(3);
  });

  it("通知の差分にはマージ後の一覧を渡す（SHAMEZO 上だけのリアクションも通知する）", async () => {
    reactionFindMany.mockResolvedValue([
      {
        emoji: "🎉",
        emojiImageUrl: null,
        user: {
          username: "local",
          displayName: null,
          avatarUrl: null,
          instance: { domain: "shamezo.example" },
        },
      },
    ]);
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(1, [FAV("a@x")]));

    await syncFavoriteCache(makeImage({ postStatus: 200 }));

    const call = reconcileMock.mock.calls[0][0];
    expect(call.currentFavoriters.map((f: CachedFavoriter) => f.acct)).toEqual([
      "a@x",
      "local@shamezo.example",
    ]);
    expect(call.count).toBe(2);
  });
});

describe("syncFavoriteCache - 初回“成功”sync の判定（通知誤爆の防止）", () => {
  it("失敗が先行(postStatus=503)＋キャッシュ空 → 初成功は wasFirstSync=true（ベースライン化）", async () => {
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(3, [FAV("a@x"), FAV("b@x")]));
    const img = makeImage({
      postStatus: 503,
      favoritesSyncedAt: new Date("2026-06-25T00:00:00Z"), // 失敗で更新済み
      favoritersCache: [],
    });
    await syncFavoriteCache(img);

    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(reconcileMock.mock.calls[0][0].wasFirstSync).toBe(true);
  });

  it("成功実績あり(postStatus=200) → wasFirstSync=false（差分通知する）", async () => {
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(4, [FAV("a@x"), FAV("c@x")]));
    const img = makeImage({
      postStatus: 200,
      favoritesSyncedAt: new Date("2026-06-25T00:00:00Z"),
      favoritersCache: [FAV("a@x")],
    });
    await syncFavoriteCache(img);

    expect(reconcileMock.mock.calls[0][0].wasFirstSync).toBe(false);
  });
});

describe("syncFavoriteCache - オーナー側の取り消し反映（reconcileRemovals）", () => {
  // reconcile 用に userId/createdAt を、merge 用に emoji 等を両方満たす行
  function reactionRow(
    userId: string,
    username: string,
    domain: string,
    createdAt: Date
  ) {
    return {
      userId,
      createdAt,
      emoji: "❤",
      emojiImageUrl: null,
      user: { username, displayName: null, avatarUrl: null, instance: { domain } },
    };
  }
  const OLD = new Date("2026-06-20T00:00:00Z"); // 猶予を十分超えた過去

  it("取り消し反映が有効な同期（GET/定期）で、一覧から消えたユーザーのリアクションを削除する", async () => {
    reactionFindMany.mockResolvedValue([
      reactionRow("u-gone", "bob", "mi.hiyoko.club", OLD),
      reactionRow("u-keep", "alice", "owner.example", OLD),
    ]);
    // オーナー一覧には alice だけ残り bob は消えた
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(1, [FAV("alice@owner.example")]));

    await syncFavoriteCache(makeImage({ postStatus: 200 }), { reconcileRemovals: true });

    expect(reactionDeleteMany).toHaveBeenCalledWith({
      where: { imageId: "img-1", userId: { in: ["u-gone"] } },
    });
  });

  it("reconcileRemovals 無し（操作直後の経路）では取り消し判定しない", async () => {
    reactionFindMany.mockResolvedValue([reactionRow("u-gone", "bob", "mi.hiyoko.club", OLD)]);
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(0, []));

    await syncFavoriteCache(makeImage({ postStatus: 200 }));

    expect(reactionDeleteMany).not.toHaveBeenCalled();
  });

  it("一覧が40件フルの回は（隠れた41件目と区別できないため）取り消し判定を諦める", async () => {
    reactionFindMany.mockResolvedValue([reactionRow("u-gone", "bob", "mi.hiyoko.club", OLD)]);
    const full = Array.from({ length: 40 }, (_, i) => FAV(`f${i}@owner.example`));
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(40, full));

    await syncFavoriteCache(makeImage({ postStatus: 200 }), { reconcileRemovals: true });

    expect(reactionDeleteMany).not.toHaveBeenCalled();
  });

  it("付けた直後（猶予内）のリアクションは一覧に無くても消さない", async () => {
    // 連合がまだ伝播していないだけの可能性があるため
    reactionFindMany.mockResolvedValue([
      reactionRow("u-fresh", "bob", "mi.hiyoko.club", new Date()),
    ]);
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(0, []));

    await syncFavoriteCache(makeImage({ postStatus: 200 }), { reconcileRemovals: true });

    expect(reactionDeleteMany).not.toHaveBeenCalled();
  });

  it("30分前のリアクションも消さない（猶予は1時間。GET経由は定期より早く回るため）", async () => {
    reactionFindMany.mockResolvedValue([
      reactionRow("u-recent", "bob", "mi.hiyoko.club", new Date(Date.now() - 30 * 60 * 1000)),
    ]);
    fetchFavoriteDataMock.mockResolvedValue(favoriteData(0, []));

    await syncFavoriteCache(makeImage({ postStatus: 200 }), { reconcileRemovals: true });

    expect(reactionDeleteMany).not.toHaveBeenCalled();
  });
});
