import { describe, it, expect } from "vitest";
import {
  filterMergedReactions,
  mergeReactions,
  type MergeReactionsInput,
} from "./merge";
import type { CachedFavoriter, StoredReaction } from "./types";

function cached(acct: string, emoji?: string | null): CachedFavoriter {
  return {
    acct,
    displayName: acct,
    avatarUrl: null,
    profileUrl: `https://${acct.split("@")[1]}/@${acct.split("@")[0]}`,
    ...(emoji === undefined ? {} : { emoji }),
  };
}

function stored(acct: string, emoji: string, imageUrl: string | null = null): StoredReaction {
  return {
    acct,
    displayName: acct,
    avatarUrl: null,
    profileUrl: null,
    emoji,
    emojiImageUrl: imageUrl,
  };
}

function input(overrides: Partial<MergeReactionsInput> = {}): MergeReactionsInput {
  return {
    fediverseCount: 0,
    totalsCache: null,
    cachedFavoriters: [],
    storedReactions: [],
    viewerAcct: null,
    ...overrides,
  };
}

describe("mergeReactions", () => {
  it("キャッシュを持たない旧画像は ❤ 1チップにまとめる", () => {
    const result = mergeReactions(
      input({
        fediverseCount: 3,
        cachedFavoriters: [cached("a@example.com"), cached("b@example.com")],
      })
    );
    expect(result.total).toBe(3);
    expect(result.chips).toEqual([
      { emoji: "❤", imageUrl: null, count: 3, reactedByViewer: false },
    ]);
    expect(result.usersByEmoji["❤"].map((u) => u.acct)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("リアクションが1件も無ければ空を返す", () => {
    const result = mergeReactions(input());
    expect(result).toEqual({ total: 0, chips: [], usersByEmoji: {}, viewerEmoji: null });
  });

  it("Misskeyオーナーの絵文字別カウントをチップにし、件数降順で並べる", () => {
    const result = mergeReactions(
      input({
        fediverseCount: 9,
        totalsCache: {
          totals: { "👍": 2, ":ai@misskey.io:": 6, "❤": 1 },
          emojiUrls: { ":ai@misskey.io:": "https://misskey.io/emoji/ai.webp" },
        },
      })
    );
    expect(result.chips.map((c) => [c.emoji, c.count])).toEqual([
      [":ai@misskey.io:", 6],
      ["👍", 2],
      ["❤", 1],
    ]);
    expect(result.chips[0].imageUrl).toBe("https://misskey.io/emoji/ai.webp");
    expect(result.total).toBe(9);
  });

  it("同数のチップはキャッシュの登場順を保つ", () => {
    const result = mergeReactions(
      input({ fediverseCount: 4, totalsCache: { totals: { "🎉": 2, "👍": 2 } } })
    );
    expect(result.chips.map((c) => c.emoji)).toEqual(["🎉", "👍"]);
  });

  it("キャッシュに居るユーザーのDBリアクションは、選んだ絵文字へ載せ替える（合計は増えない）", () => {
    // Mastodonユーザーが SHAMEZO で👍を選ぶと、連合には favourite としてしか届かず
    // キャッシュ上は ❤ に見える。表示は👍へ寄せる。
    const result = mergeReactions(
      input({
        fediverseCount: 2,
        cachedFavoriters: [cached("a@example.com"), cached("b@example.com")],
        storedReactions: [stored("a@example.com", "👍")],
      })
    );
    expect(result.total).toBe(2);
    expect(result.chips.map((c) => [c.emoji, c.count])).toEqual([
      ["❤", 1],
      ["👍", 1],
    ]);
    expect(result.usersByEmoji["❤"].map((u) => u.acct)).toEqual(["b@example.com"]);
    expect(result.usersByEmoji["👍"].map((u) => u.acct)).toEqual(["a@example.com"]);
  });

  it("キャッシュに居ないDBリアクションは合計を増やす（上位40件外・連合未反映・local投稿）", () => {
    const result = mergeReactions(
      input({
        fediverseCount: 1,
        cachedFavoriters: [cached("a@example.com")],
        storedReactions: [stored("z@example.com", "🎉")],
      })
    );
    expect(result.total).toBe(2);
    expect(result.chips.map((c) => [c.emoji, c.count])).toEqual([
      ["❤", 1],
      ["🎉", 1],
    ]);
  });

  it("local投稿（連合キャッシュなし）はDBのリアクションだけで組み立てる", () => {
    const result = mergeReactions(
      input({
        storedReactions: [
          stored("a@example.com", "🎉"),
          stored("b@example.com", "🎉"),
          stored("c@example.com", "👍"),
        ],
      })
    );
    expect(result.total).toBe(3);
    expect(result.chips.map((c) => [c.emoji, c.count])).toEqual([
      ["🎉", 2],
      ["👍", 1],
    ]);
  });

  it("Misskeyオーナーの内訳から、DBで別絵文字に付け替えた分を差し引く", () => {
    const result = mergeReactions(
      input({
        fediverseCount: 3,
        totalsCache: { totals: { "❤": 3 } },
        cachedFavoriters: [
          cached("a@example.com", "❤"),
          cached("b@example.com", "❤"),
          cached("c@example.com", "❤"),
        ],
        storedReactions: [stored("a@example.com", ":ai@misskey.io:", "https://x/ai.webp")],
      })
    );
    expect(result.total).toBe(3);
    expect(result.chips.map((c) => [c.emoji, c.count])).toEqual([
      ["❤", 2],
      [":ai@misskey.io:", 1],
    ]);
    expect(result.chips[1].imageUrl).toBe("https://x/ai.webp");
  });

  it("同じ絵文字を押し直した場合はチップの件数が変わらない", () => {
    const result = mergeReactions(
      input({
        fediverseCount: 2,
        totalsCache: { totals: { "❤": 2 } },
        cachedFavoriters: [cached("a@example.com", "❤"), cached("b@example.com", "❤")],
        storedReactions: [stored("a@example.com", "❤")],
      })
    );
    expect(result.chips).toEqual([
      { emoji: "❤", imageUrl: null, count: 2, reactedByViewer: false },
    ]);
    expect(result.total).toBe(2);
  });

  it("viewerEmoji は DB のリアクションを優先し、無ければキャッシュから拾う", () => {
    const dbWins = mergeReactions(
      input({
        fediverseCount: 1,
        cachedFavoriters: [cached("me@example.com")],
        storedReactions: [stored("me@example.com", "👍")],
        viewerAcct: "me@example.com",
      })
    );
    expect(dbWins.viewerEmoji).toBe("👍");
    expect(dbWins.chips.find((c) => c.emoji === "👍")?.reactedByViewer).toBe(true);

    const fromCache = mergeReactions(
      input({
        fediverseCount: 1,
        cachedFavoriters: [cached("me@example.com")],
        viewerAcct: "me@example.com",
      })
    );
    expect(fromCache.viewerEmoji).toBe("❤");
  });

  it("未ログイン・未リアクションの viewerEmoji は null", () => {
    expect(mergeReactions(input({ fediverseCount: 1 })).viewerEmoji).toBeNull();
    expect(
      mergeReactions(
        input({
          fediverseCount: 1,
          cachedFavoriters: [cached("a@example.com")],
          viewerAcct: "me@example.com",
        })
      ).viewerEmoji
    ).toBeNull();
  });

  it("キャッシュの内訳が合計と食い違っても、チップの総和を合計として返す", () => {
    // 上位40件の一覧と totals は別タイミングの取得になり得るため、両者はズレることがある。
    // 一覧の「＋N」と詳細のチップが食い違って見えないよう、常にチップ側に合わせる。
    const result = mergeReactions(
      input({ fediverseCount: 100, totalsCache: { totals: { "👍": 2 } } })
    );
    expect(result.total).toBe(2);
  });

  it("キャッシュに無い絵文字を持つユーザーを載せ替えても件数が負にならない", () => {
    const result = mergeReactions(
      input({
        fediverseCount: 1,
        totalsCache: { totals: { "👍": 1 } },
        cachedFavoriters: [cached("a@example.com", "❤")],
        storedReactions: [stored("a@example.com", "🎉")],
      })
    );
    expect(result.chips.map((c) => [c.emoji, c.count])).toEqual([
      ["👍", 1],
      ["🎉", 1],
    ]);
    expect(result.total).toBe(2);
  });
});

describe("filterMergedReactions", () => {
  it("ミュートが空なら同じ参照をそのまま返す", () => {
    const merged = mergeReactions(
      input({ fediverseCount: 2, cachedFavoriters: [cached("a@ex.com"), cached("b@ex.com")] })
    );
    expect(filterMergedReactions(merged, new Set())).toBe(merged);
  });

  it("ミュート相手を一覧から除き、件数もその分減らす", () => {
    const merged = mergeReactions(
      input({ fediverseCount: 3, cachedFavoriters: [cached("a@ex.com"), cached("b@ex.com"), cached("c@ex.com")] })
    );
    const filtered = filterMergedReactions(merged, new Set(["b@ex.com"]));
    expect(filtered.total).toBe(2);
    expect(filtered.chips).toEqual([
      { emoji: "❤", imageUrl: null, count: 2, reactedByViewer: false },
    ]);
    expect(filtered.usersByEmoji["❤"].map((u) => u.acct)).toEqual(["a@ex.com", "c@ex.com"]);
  });

  it("ミュート相手だけのチップは丸ごと落とす", () => {
    const merged = mergeReactions(
      input({
        totalsCache: { totals: { "👍": 1, "🎉": 1 } },
        cachedFavoriters: [cached("a@ex.com", "👍"), cached("b@ex.com", "🎉")],
      })
    );
    const filtered = filterMergedReactions(merged, new Set(["b@ex.com"]));
    expect(filtered.chips.map((c) => c.emoji)).toEqual(["👍"]);
    expect(filtered.usersByEmoji["🎉"]).toBeUndefined();
    expect(filtered.total).toBe(1);
  });

  it("上位40件外のミュート相手は識別できないため件数を減らさない", () => {
    // fediverseCount=5 だがキャッシュには1人しか載っていない（残り4人は匿名の総数）
    const merged = mergeReactions(
      input({ fediverseCount: 5, cachedFavoriters: [cached("m@ex.com")] })
    );
    const filtered = filterMergedReactions(merged, new Set(["m@ex.com"]));
    // 識別できた1人分だけ減る
    expect(filtered.total).toBe(4);
    expect(filtered.usersByEmoji["❤"]).toEqual([]);
  });

  it("閲覧者自身のリアクション(viewerEmoji)は保持される", () => {
    const merged = mergeReactions(
      input({
        totalsCache: { totals: { "👍": 1 } },
        cachedFavoriters: [cached("me@ex.com", "👍")],
        viewerAcct: "me@ex.com",
      })
    );
    const filtered = filterMergedReactions(merged, new Set(["other@ex.com"]));
    expect(filtered.viewerEmoji).toBe("👍");
  });
});
