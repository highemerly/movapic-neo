import { describe, it, expect, vi } from "vitest";

// emojis.ts は prisma を import する（groupEmojisByCategory 自体は使わないが、
// モジュール読込時に評価されるため）。純関数テストなので中身は空で遮断する。
vi.mock("@/lib/db", () => ({ default: {} }));

import { groupEmojisByCategory, type CustomEmoji, type EmojiCatalog } from "./emojis";

function emoji(name: string, category: string | null): CustomEmoji {
  return { name, url: `https://x/${name}.webp`, category, aliases: [] };
}

function catalogOf(emojis: CustomEmoji[]): EmojiCatalog {
  return { emojis, byName: new Map(emojis.map((e) => [e.name, e])) };
}

describe("groupEmojisByCategory", () => {
  it("カテゴリごとに区切り、名前順・未分類は「その他」で末尾に並べる", () => {
    const catalog = catalogOf([
      emoji("a", "動物"),
      emoji("b", null),
      emoji("c", "キャラ"),
      emoji("d", "動物"),
    ]);
    const { sections, truncated } = groupEmojisByCategory(catalog, 100);
    expect(truncated).toBe(false);
    expect(sections.map((s) => s.category)).toEqual(["キャラ", "動物", "その他"]);
    expect(sections.find((s) => s.category === "動物")!.emojis.map((e) => e.name)).toEqual([
      "a",
      "d",
    ]);
  });

  it("全体の上限を超えたら打ち切り、truncated を立てる", () => {
    const catalog = catalogOf([
      emoji("a", "x"),
      emoji("b", "x"),
      emoji("c", "y"),
    ]);
    const { sections, truncated } = groupEmojisByCategory(catalog, 2);
    expect(truncated).toBe(true);
    // 2件で打ち切り（xカテゴリの2件）
    expect(sections.flatMap((s) => s.emojis)).toHaveLength(2);
  });

  it("空カタログは空セクション", () => {
    const { sections, truncated } = groupEmojisByCategory(catalogOf([]), 100);
    expect(sections).toEqual([]);
    expect(truncated).toBe(false);
  });
});
