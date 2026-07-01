import { describe, it, expect } from "vitest";
import {
  parsePageLimit,
  cursorPageArgs,
  slicePage,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "./pagination";

describe("parsePageLimit", () => {
  it("未指定(null) → defaultLimit", () => {
    expect(parsePageLimit(null)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("空文字 → defaultLimit", () => {
    expect(parsePageLimit("")).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("数値化できない値（\"abc\"）→ defaultLimit（NaN を返さない・take:NaN 回避）", () => {
    expect(parsePageLimit("abc")).toBe(DEFAULT_PAGE_LIMIT);
    expect(Number.isNaN(parsePageLimit("abc"))).toBe(false);
  });

  it("正常な数値はそのまま", () => {
    expect(parsePageLimit("5")).toBe(5);
  });

  it("maxLimit を超える値は maxLimit にクランプ", () => {
    expect(parsePageLimit("1000")).toBe(MAX_PAGE_LIMIT);
  });

  it("0 / 負値は下限 1 にクランプ", () => {
    expect(parsePageLimit("0")).toBe(1);
    expect(parsePageLimit("-5")).toBe(1);
  });

  it("小数は整数へ切り捨て", () => {
    expect(parsePageLimit("3.9")).toBe(3);
  });

  it("defaultLimit / maxLimit を上書きできる", () => {
    expect(parsePageLimit(null, { defaultLimit: 7 })).toBe(7);
    expect(parsePageLimit("abc", { defaultLimit: 7 })).toBe(7);
    expect(parsePageLimit("999", { maxLimit: 50 })).toBe(50);
  });
});

describe("cursorPageArgs", () => {
  it("cursor 無し → take: limit+1 のみ", () => {
    expect(cursorPageArgs(null, 20)).toEqual({ take: 21 });
  });

  it("cursor 有り → cursor+skip:1 を付与", () => {
    expect(cursorPageArgs("abc", 20)).toEqual({
      take: 21,
      cursor: { id: "abc" },
      skip: 1,
    });
  });
});

describe("slicePage", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}` }));

  it("limit+1 件 → hasMore=true・末尾を切り落とし nextCursor を返す", () => {
    const { result, hasMore, nextCursor } = slicePage(rows(21), 20);
    expect(hasMore).toBe(true);
    expect(result).toHaveLength(20);
    expect(nextCursor).toBe("id19");
  });

  it("limit 以下 → hasMore=false・nextCursor=null", () => {
    const { result, hasMore, nextCursor } = slicePage(rows(5), 20);
    expect(hasMore).toBe(false);
    expect(result).toHaveLength(5);
    expect(nextCursor).toBeNull();
  });

  it("空配列 → hasMore=false・nextCursor=null", () => {
    expect(slicePage([], 20)).toEqual({ result: [], hasMore: false, nextCursor: null });
  });
});
