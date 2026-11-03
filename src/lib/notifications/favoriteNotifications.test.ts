/**
 * リアクション通知の差分更新（reconcileFavoriteNotificationSafely）。
 * 保存する favoriters の先頭＝通知に出る「最新のリアクション」になることを固定する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CachedFavoriter } from "@/lib/fediverse/favorite";

const { findUnique, create, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { notification: { findUnique, create, update } },
}));

import {
  reconcileFavoriteNotificationSafely,
  type FavoriteNotificationData,
} from "./favoriteNotifications";

function fav(acct: string, emoji: string): CachedFavoriter {
  return { acct, displayName: acct, avatarUrl: null, profileUrl: null, emoji, emojiImageUrl: null };
}

const BASE = {
  imageId: "img",
  ownerUserId: "owner",
  ownerAcct: "owner@example.com",
  wasFirstSync: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({});
  update.mockResolvedValue({});
});

function savedData(mock: typeof create | typeof update): FavoriteNotificationData {
  return mock.mock.calls[0][0].data.data as FavoriteNotificationData;
}

describe("reconcileFavoriteNotificationSafely", () => {
  it("既存通知に新しい人が現れたら、件数の多い❤より前にその人の絵文字を置く", async () => {
    findUnique.mockResolvedValue({
      data: {
        count: 2,
        favoriters: [fav("a@x", "❤"), fav("b@x", "❤")],
        seenAccts: ["a@x", "b@x"],
      },
    });

    // マージ後の一覧はチップ順（❤が最多なので先）
    await reconcileFavoriteNotificationSafely({
      ...BASE,
      previousFavoriters: [],
      currentFavoriters: [fav("a@x", "❤"), fav("b@x", "❤"), fav("c@x", "🎉")],
      count: 3,
    });

    const data = savedData(update);
    expect(data.favoriters.map((f) => f.acct)).toEqual(["c@x", "a@x", "b@x"]);
    expect(data.favoriters[0].emoji).toBe("🎉");
    expect(data.seenAccts).toEqual(["c@x", "a@x", "b@x"]);
    expect(update.mock.calls[0][0].data.createdAt).toBeInstanceOf(Date);
  });

  it("新しい人がいない同期では前回の並び（最新順）を保つ", async () => {
    findUnique.mockResolvedValue({
      data: {
        count: 3,
        favoriters: [fav("c@x", "🎉"), fav("a@x", "❤"), fav("b@x", "❤")],
        seenAccts: ["c@x", "a@x", "b@x"],
      },
    });

    await reconcileFavoriteNotificationSafely({
      ...BASE,
      previousFavoriters: [],
      currentFavoriters: [fav("a@x", "❤"), fav("b@x", "❤"), fav("c@x", "🎉")],
      count: 3,
    });

    const data = savedData(update);
    expect(data.favoriters.map((f) => f.acct)).toEqual(["c@x", "a@x", "b@x"]);
    // 未読にはしない
    expect(update.mock.calls[0][0].data.createdAt).toBeUndefined();
  });

  it("通知を新規作成するときも、直前のキャッシュに居なかった人を先頭にする", async () => {
    findUnique.mockResolvedValue(null);

    await reconcileFavoriteNotificationSafely({
      ...BASE,
      previousFavoriters: [fav("a@x", "❤"), fav("b@x", "❤")],
      currentFavoriters: [fav("a@x", "❤"), fav("b@x", "❤"), fav("c@x", "🎉")],
      count: 3,
    });

    const data = savedData(create);
    expect(data.favoriters.map((f) => f.acct)).toEqual(["c@x", "a@x", "b@x"]);
    expect(data.seenAccts).toEqual(["c@x", "a@x", "b@x"]);
  });

  it("取得が空のときは前回の表示用一覧を保持する", async () => {
    const previous = [fav("c@x", "🎉"), fav("a@x", "❤")];
    findUnique.mockResolvedValue({
      data: { count: 2, favoriters: previous, seenAccts: ["c@x", "a@x"] },
    });

    await reconcileFavoriteNotificationSafely({
      ...BASE,
      previousFavoriters: [],
      currentFavoriters: [],
      count: 2,
    });

    expect(savedData(update).favoriters).toEqual(previous);
  });
});
