import { describe, it, expect, vi } from "vitest";

// customEmoji.ts は prisma を import するため、DB 初期化を避けてモックしてから純粋関数を試す。
vi.mock("@/lib/db", () => ({ default: {} }));

import {
  ALLOWED_EMOJI_MIME_TYPES,
  EMOJI_NAME_PATTERN,
  emojiExtensionFromMimeType,
  groupShamezoEmojisByCategory,
  isAllowedEmojiMimeType,
  searchShamezoEmojis,
  type ShamezoEmoji,
} from "./customEmoji";

function emoji(name: string, category: string | null, aliases: string[] = []): ShamezoEmoji {
  return {
    name,
    category,
    aliases,
    imageUrl: `https://s3.example/emoji/${name}.png`,
    license: null,
  };
}

describe("EMOJI_NAME_PATTERN", () => {
  it("英数字・_ + - を許可する", () => {
    expect(EMOJI_NAME_PATTERN.test("shamezo_wktk")).toBe(true);
    expect(EMOJI_NAME_PATTERN.test("a+b-c")).toBe(true);
  });

  it("空・記号・64文字超は不可", () => {
    expect(EMOJI_NAME_PATTERN.test("")).toBe(false);
    expect(EMOJI_NAME_PATTERN.test("あ")).toBe(false);
    expect(EMOJI_NAME_PATTERN.test(":ai:")).toBe(false);
    expect(EMOJI_NAME_PATTERN.test("a".repeat(65))).toBe(false);
  });
});

describe("isAllowedEmojiMimeType / emojiExtensionFromMimeType", () => {
  it("許可形式（アニメ含む）を通す", () => {
    for (const mime of ALLOWED_EMOJI_MIME_TYPES) {
      expect(isAllowedEmojiMimeType(mime)).toBe(true);
    }
  });

  it("SVG は許可しない（XSS 回避）", () => {
    expect(isAllowedEmojiMimeType("image/svg+xml")).toBe(false);
  });

  it("APNG は png 拡張子（png コンテナのため）", () => {
    expect(emojiExtensionFromMimeType("image/apng")).toBe("png");
    expect(emojiExtensionFromMimeType("image/gif")).toBe("gif");
    expect(emojiExtensionFromMimeType("image/jpeg")).toBe("jpg");
  });
});

describe("searchShamezoEmojis", () => {
  const emojis = [
    emoji("wktk", "表情", ["わくわく"]),
    emoji("kusa", "表情", ["草", "www"]),
    emoji("neko", "動物"),
  ];

  it("名前の部分一致で絞り込む", () => {
    const r = searchShamezoEmojis(emojis, "ktk", 10);
    expect(r.emojis.map((e) => e.name)).toEqual(["wktk"]);
    expect(r.total).toBe(1);
  });

  it("エイリアスでも一致する", () => {
    const r = searchShamezoEmojis(emojis, "草", 10);
    expect(r.emojis.map((e) => e.name)).toEqual(["kusa"]);
  });

  it("空クエリは全件（limit まで）", () => {
    const r = searchShamezoEmojis(emojis, "", 2);
    expect(r.emojis).toHaveLength(2);
    expect(r.total).toBe(3);
  });
});

describe("groupShamezoEmojisByCategory", () => {
  it("カテゴリ順に区切り、未設定は「その他」で末尾", () => {
    const grouped = groupShamezoEmojisByCategory([
      emoji("neko", null),
      emoji("wktk", "表情"),
      emoji("inu", "動物"),
    ]);
    expect(grouped.map((s) => s.category)).toEqual(["動物", "表情", "その他"]);
    expect(grouped.at(-1)!.emojis.map((e) => e.name)).toEqual(["neko"]);
  });
});
