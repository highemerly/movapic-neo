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
const { imageUpdate, fetchFavoriteDataMock, reconcileMock } = vi.hoisted(() => ({
  imageUpdate: vi.fn(),
  fetchFavoriteDataMock: vi.fn(),
  reconcileMock: vi.fn(),
}));

// prisma は image.update だけ使う
vi.mock("@/lib/db", () => ({
  default: { image: { update: imageUpdate } },
}));

// ネットワーク層は fetchFavoriteData のみ差し替え、FavoriteError/分類ヘルパは実物を使う
vi.mock("@/lib/fediverse/favorite", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/fediverse/favorite")>();
  return { ...actual, fetchFavoriteData: fetchFavoriteDataMock };
});

// 通知差分の中身は favoriteNotifications 側の責務。ここでは呼び出し有無・wasFirstSync だけ見る
vi.mock("@/lib/notifications/favoriteNotifications", () => ({
  reconcileFavoriteNotificationSafely: reconcileMock,
}));

import { FavoriteError, type CachedFavoriter } from "@/lib/fediverse/favorite";
import { syncFavoriteCache, type ImageForFavorite } from "@/lib/fediverse/favoriteSync";

const FAV = (acct: string): CachedFavoriter => ({
  acct,
  displayName: null,
  avatarUrl: null,
  profileUrl: null,
});

function makeImage(over: Partial<Record<string, unknown>> = {}): ImageForFavorite {
  return {
    id: "img-1",
    postId: "note-1",
    userId: "user-1",
    favoriteCount: 5,
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
  fetchFavoriteDataMock.mockReset();
  reconcileMock.mockReset().mockResolvedValue(undefined);
});

describe("syncFavoriteCache - ステータス別の結果（3経路共通の同期エンジン）", () => {
  it("200成功: count/cache/postStatus=200/syncedAt を更新し、取得値を返す", async () => {
    fetchFavoriteDataMock.mockResolvedValue({ count: 3, favoriters: [FAV("a@x")] });
    const res = await syncFavoriteCache(makeImage({ favoritersCache: [], postStatus: null }));

    expect(res).toEqual({ count: 3, favoriters: [FAV("a@x")], errorReason: null });
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

    expect(res).toEqual({ count: 5, favoriters: [FAV("old@x")], errorReason: "deleted" });
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

    expect(res).toEqual({ count: 9, favoriters: [FAV("keep@x")], errorReason: "unavailable" });
    expect(lastUpdateData().postStatus).toBe(0);
  });

  it("成功パスで DB 永続化が失敗しても throw せず取得値を返し、通知差分はスキップ", async () => {
    fetchFavoriteDataMock.mockResolvedValue({ count: 3, favoriters: [FAV("a@x")] });
    imageUpdate.mockRejectedValue(new Error("db down"));

    const res = await syncFavoriteCache(makeImage());
    expect(res).toEqual({ count: 3, favoriters: [FAV("a@x")], errorReason: null });
    // 永続化できていないので誤通知を避けるため差分はスキップ
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("失敗パスで失敗状態の永続化が失敗しても throw しない", async () => {
    fetchFavoriteDataMock.mockRejectedValue(new FavoriteError("unavailable", 429));
    imageUpdate.mockRejectedValue(new Error("db down"));

    const res = await syncFavoriteCache(makeImage({ favoriteCount: 7, favoritersCache: [FAV("keep@x")] }));
    expect(res).toEqual({ count: 7, favoriters: [FAV("keep@x")], errorReason: "unavailable" });
  });
});

describe("syncFavoriteCache - 初回“成功”sync の判定（通知誤爆の防止）", () => {
  it("失敗が先行(postStatus=503)＋キャッシュ空 → 初成功は wasFirstSync=true（ベースライン化）", async () => {
    fetchFavoriteDataMock.mockResolvedValue({ count: 3, favoriters: [FAV("a@x"), FAV("b@x")] });
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
    fetchFavoriteDataMock.mockResolvedValue({ count: 4, favoriters: [FAV("a@x"), FAV("c@x")] });
    const img = makeImage({
      postStatus: 200,
      favoritesSyncedAt: new Date("2026-06-25T00:00:00Z"),
      favoritersCache: [FAV("a@x")],
    });
    await syncFavoriteCache(img);

    expect(reconcileMock.mock.calls[0][0].wasFirstSync).toBe(false);
  });
});
