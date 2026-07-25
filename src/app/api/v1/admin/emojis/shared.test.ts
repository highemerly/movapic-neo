import { describe, it, expect, vi } from "vitest";

// shared.ts は session / db(prisma) を辿るため、純粋な検証関数だけ試すべくモックする。
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { validateEmojiName, parseAliases, parseCategory } from "./shared";

describe("validateEmojiName", () => {
  it("正しい名前は trim して通す", () => {
    expect(validateEmojiName("  wktk  ")).toEqual({ name: "wktk" });
  });

  it("空・記号・非文字列はエラー", () => {
    expect("error" in validateEmojiName("")).toBe(true);
    expect("error" in validateEmojiName("あ")).toBe(true);
    expect("error" in validateEmojiName(123)).toBe(true);
  });
});

describe("parseAliases", () => {
  it("カンマ・空白区切りを配列化し空要素を落とす", () => {
    expect(parseAliases("わくわく, ワクワク  ,, wktk")).toEqual([
      "わくわく",
      "ワクワク",
      "wktk",
    ]);
  });

  it("非文字列は空配列", () => {
    expect(parseAliases(null)).toEqual([]);
  });

  it("最大20件で打ち切る", () => {
    const many = Array.from({ length: 30 }, (_, i) => `a${i}`).join(",");
    expect(parseAliases(many)).toHaveLength(20);
  });
});

describe("parseCategory", () => {
  it("trim して返す・空は null", () => {
    expect(parseCategory("  表情 ")).toBe("表情");
    expect(parseCategory("   ")).toBeNull();
    expect(parseCategory(undefined)).toBeNull();
  });
});
