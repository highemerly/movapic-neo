import { describe, it, expect } from "vitest";
import type { FavoriteFeedData } from "@/components/layout/useUnseenNotifications";
import { favoriteNotificationOverflow, favoriterName, latestReactionEmojis } from "./format";

function feed(emojis: (string | null)[]): FavoriteFeedData {
  return {
    count: emojis.length,
    favoriters: emojis.map((emoji, i) => ({
      acct: `u${i}@x`,
      displayName: null,
      avatarUrl: null,
      profileUrl: null,
      emoji,
      emojiImageUrl: emoji?.startsWith(":") ? `https://x/${i}.png` : null,
    })),
  };
}

describe("latestReactionEmojis", () => {
  it("先頭（最新）から3件を、同じ絵文字もまとめずに並べる", () => {
    expect(latestReactionEmojis(feed(["🎉", "❤", "❤", "👍"]))).toEqual([
      { emoji: "🎉", imageUrl: null },
      { emoji: "❤", imageUrl: null },
      { emoji: "❤", imageUrl: null },
    ]);
  });

  it("カスタム絵文字は画像URLも渡す", () => {
    expect(latestReactionEmojis(feed([":blob@shamezo:"]))).toEqual([
      { emoji: ":blob@shamezo:", imageUrl: "https://x/0.png" },
    ]);
  });

  it("絵文字を持たない旧通知の行は飛ばし、全部無ければ空", () => {
    expect(latestReactionEmojis(feed([null, "🎉"]))).toEqual([{ emoji: "🎉", imageUrl: null }]);
    expect(latestReactionEmojis(feed([null]))).toEqual([]);
    expect(latestReactionEmojis(null)).toEqual([]);
  });
});

describe("favoriteNotificationOverflow", () => {
  it("合計から並べた数を引いた残りを返し、収まっていれば 0", () => {
    expect(favoriteNotificationOverflow(feed(["🎉", "❤", "❤", "👍", "👍"]), 3)).toBe(2);
    expect(favoriteNotificationOverflow(feed(["🎉", "❤"]), 2)).toBe(0);
    expect(favoriteNotificationOverflow(null, 1)).toBe(0);
  });
});

describe("favoriterName", () => {
  it("表示名、無ければ acct のローカル部（ドメインは出さない）", () => {
    const base = { avatarUrl: null, profileUrl: null, emoji: null, emojiImageUrl: null };
    expect(favoriterName({ ...base, acct: "bob@ex.com", displayName: "ボブ" })).toBe("ボブ");
    expect(favoriterName({ ...base, acct: "bob@ex.com", displayName: " " })).toBe("bob");
  });
});
