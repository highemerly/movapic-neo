import { describe, it, expect } from "vitest";
import {
  listUnicodeCategories,
  listUnicodeSections,
  searchUnicodeEmojis,
  unicodeCategoryId,
} from "./unicodeCatalog";

describe("listUnicodeCategories", () => {
  it("component と地域指標を除いた9カテゴリを表示順で返す（ジャンプ用アイコン付き）", () => {
    const categories = listUnicodeCategories();
    expect(categories).toHaveLength(9);
    expect(categories[0]).toEqual({
      id: "unicode:0",
      label: "スマイリー・感情",
      icon: "😀",
    });
    // group 2（component）は含まない
    expect(categories.some((c) => c.id === "unicode:2")).toBe(false);
  });
});

describe("listUnicodeSections", () => {
  it("カテゴリごとに区切った全絵文字を返す（1画面スクロール用）", () => {
    const sections = listUnicodeSections();
    expect(sections).toHaveLength(9);
    // 各セクションに絵文字が入っている
    expect(sections.every((s) => s.emojis.length > 0)).toBe(true);
    // 全絵文字数はカタログ全体（1900件前後）
    const total = sections.reduce((sum, s) => sum + s.emojis.length, 0);
    expect(total).toBeGreaterThan(1500);
    // 各絵文字は正規化キー・表示用・ラベルを持つ
    const first = sections[0].emojis[0];
    expect(first).toHaveProperty("key");
    expect(first).toHaveProperty("display");
    expect(first).toHaveProperty("label");
  });
});

describe("searchUnicodeEmojis", () => {
  it("日本語のタグで検索できる", () => {
    const { emojis } = searchUnicodeEmojis({ query: "猫", limit: 50 });
    expect(emojis.length).toBeGreaterThan(0);
    // 猫の顔などがヒットする
    expect(emojis.some((e) => e.display.includes("🐱") || e.display.includes("🐈"))).toBe(
      true
    );
  });

  it("日本語ラベルでも検索できる", () => {
    const { emojis } = searchUnicodeEmojis({ query: "ハート", limit: 50 });
    expect(emojis.some((e) => e.key === "❤")).toBe(true);
  });

  it("カテゴリで絞り込める", () => {
    const { emojis, total } = searchUnicodeEmojis({
      categoryId: unicodeCategoryId(0),
      limit: 1000,
    });
    expect(total).toBeGreaterThan(0);
    expect(emojis.every((e) => e.group === 0)).toBe(true);
  });

  it("異体字セレクタを除去した正規化キーを返す", () => {
    const { emojis } = searchUnicodeEmojis({ query: "赤いハート", limit: 5 });
    const heart = emojis.find((e) => e.display === "❤️");
    expect(heart?.key).toBe("❤"); // U+FE0F 除去済み
  });

  it("limit で件数を絞り、total は全件数を返す", () => {
    const { emojis, total } = searchUnicodeEmojis({
      categoryId: unicodeCategoryId(1),
      limit: 10,
    });
    expect(emojis).toHaveLength(10);
    expect(total).toBeGreaterThan(10);
  });

  it("該当なしは空配列", () => {
    const { emojis, total } = searchUnicodeEmojis({
      query: "存在しない絵文字名zzz",
      limit: 50,
    });
    expect(emojis).toEqual([]);
    expect(total).toBe(0);
  });
});
