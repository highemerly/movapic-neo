import { describe, it, expect } from "vitest";
import { applyViewerReaction } from "./optimistic";
import { mergeReactions } from "./merge";
import type { MergedReactions, ReactionUser } from "./types";

const viewer: ReactionUser = {
  acct: "me@example.com",
  displayName: "わたし",
  avatarUrl: null,
  profileUrl: "https://example.com/@me",
};

const other: ReactionUser = {
  acct: "you@example.com",
  displayName: "あなた",
  avatarUrl: null,
  profileUrl: "https://example.com/@you",
};

function snapshot(overrides: Partial<MergedReactions> = {}): MergedReactions {
  return {
    total: 0,
    chips: [],
    usersByEmoji: {},
    viewerEmoji: null,
    ...overrides,
  };
}

describe("applyViewerReaction", () => {
  it("未リアクションの状態から押すと、チップと自分の一覧が増える", () => {
    const next = applyViewerReaction(snapshot(), viewer, { emoji: "👍", imageUrl: null });

    expect(next.total).toBe(1);
    expect(next.chips).toEqual([
      { emoji: "👍", imageUrl: null, count: 1, reactedByViewer: true },
    ]);
    expect(next.usersByEmoji["👍"]).toEqual([viewer]);
    expect(next.viewerEmoji).toBe("👍");
  });

  it("既にあるチップに乗ると件数が増え、自分は末尾に並ぶ", () => {
    const current = snapshot({
      total: 1,
      chips: [{ emoji: "👍", imageUrl: null, count: 1, reactedByViewer: false }],
      usersByEmoji: { "👍": [other] },
    });

    const next = applyViewerReaction(current, viewer, { emoji: "👍", imageUrl: null });

    expect(next.total).toBe(2);
    expect(next.chips[0]).toEqual({
      emoji: "👍",
      imageUrl: null,
      count: 2,
      reactedByViewer: true,
    });
    expect(next.usersByEmoji["👍"]).toEqual([other, viewer]);
  });

  it("付け替えると元のチップから外れて新しいチップに移る", () => {
    const current = snapshot({
      total: 2,
      chips: [
        { emoji: "❤", imageUrl: null, count: 1, reactedByViewer: true },
        { emoji: "👍", imageUrl: null, count: 1, reactedByViewer: false },
      ],
      usersByEmoji: { "❤": [viewer], "👍": [other] },
      viewerEmoji: "❤",
    });

    const next = applyViewerReaction(current, viewer, { emoji: "👍", imageUrl: null });

    expect(next.total).toBe(2);
    // ❤ は自分だけだったので消える
    expect(next.chips).toEqual([
      { emoji: "👍", imageUrl: null, count: 2, reactedByViewer: true },
    ]);
    expect(next.usersByEmoji["❤"]).toBeUndefined();
    expect(next.usersByEmoji["👍"]).toEqual([other, viewer]);
    expect(next.viewerEmoji).toBe("👍");
  });

  it("取り消すと自分の分だけ減り、他の人が残っているチップは残る", () => {
    const current = snapshot({
      total: 2,
      chips: [{ emoji: "👍", imageUrl: null, count: 2, reactedByViewer: true }],
      usersByEmoji: { "👍": [other, viewer] },
      viewerEmoji: "👍",
    });

    const next = applyViewerReaction(current, viewer, null);

    expect(next.total).toBe(1);
    expect(next.chips).toEqual([
      { emoji: "👍", imageUrl: null, count: 1, reactedByViewer: false },
    ]);
    expect(next.usersByEmoji["👍"]).toEqual([other]);
    expect(next.viewerEmoji).toBeNull();
  });

  it("カスタム絵文字は渡された画像URLでチップを作る", () => {
    const next = applyViewerReaction(snapshot(), viewer, {
      emoji: ":neko@example.com:",
      imageUrl: "/api/emoji/neko.png",
    });

    expect(next.chips[0].imageUrl).toBe("/api/emoji/neko.png");
  });

  it("件数降順に並び替え、同数のチップは元の並びを保つ", () => {
    const current = snapshot({
      total: 4,
      chips: [
        { emoji: "❤", imageUrl: null, count: 3, reactedByViewer: false },
        { emoji: "👍", imageUrl: null, count: 1, reactedByViewer: false },
      ],
      usersByEmoji: { "❤": [other, other, other], "👍": [other] },
    });

    // 自分の🎉が1件増えても、同数の👍より後ろのまま
    const next = applyViewerReaction(current, viewer, { emoji: "🎉", imageUrl: null });

    expect(next.chips.map((chip) => chip.emoji)).toEqual(["❤", "👍", "🎉"]);
  });

  it("上位40件のキャッシュに自分が載っていなくても件数だけは正しく減る", () => {
    // オーナー側の合計は分かるが一覧には自分が入っていない状態（キャッシュは上位40件のみ）
    const current = snapshot({
      total: 50,
      chips: [{ emoji: "❤", imageUrl: null, count: 50, reactedByViewer: true }],
      usersByEmoji: { "❤": [other] },
      viewerEmoji: "❤",
    });

    const next = applyViewerReaction(current, viewer, null);

    expect(next.total).toBe(49);
    expect(next.usersByEmoji["❤"]).toEqual([other]);
  });

  it("確定値（mergeReactions）と同じ形になる", () => {
    const before = mergeReactions({
      fediverseCount: 0,
      totalsCache: null,
      cachedFavoriters: [],
      storedReactions: [
        { ...other, emoji: "👍", emojiImageUrl: null },
      ],
      viewerAcct: viewer.acct,
    });

    const optimistic = applyViewerReaction(before, viewer, { emoji: "🎉", imageUrl: null });

    const confirmed = mergeReactions({
      fediverseCount: 0,
      totalsCache: null,
      cachedFavoriters: [],
      storedReactions: [
        { ...other, emoji: "👍", emojiImageUrl: null },
        { ...viewer, emoji: "🎉", emojiImageUrl: null },
      ],
      viewerAcct: viewer.acct,
    });

    expect(optimistic).toEqual(confirmed);
  });
});
