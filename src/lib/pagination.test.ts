import { describe, it, expect } from "vitest";
import {
  parsePageLimit,
  cursorPageArgs,
  slicePage,
  sliceSincePage,
  reconcileTimeline,
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

describe("sliceSincePage", () => {
  // 昇順（古い→新しい）で渡ってくる前提。表示順（新しい→古い）へ反転する。
  const asc = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}` }));

  it("limit以下 → gap=false・新しい順へ反転して全件返す", () => {
    const { result, gap } = sliceSincePage(asc(3), 20);
    expect(gap).toBe(false);
    expect(result.map((r) => r.id)).toEqual(["id2", "id1", "id0"]);
  });

  it("limit+1件 → gap=true（穴あり＝呼び出し側は全差し替えにフォールバック）", () => {
    const { gap } = sliceSincePage(asc(21), 20);
    expect(gap).toBe(true);
  });

  it("空配列（新着なし）→ gap=false・空配列", () => {
    expect(sliceSincePage([], 20)).toEqual({ result: [], gap: false });
  });

  it("入力配列を破壊しない（reverseの副作用を出さない）", () => {
    const input = asc(3);
    sliceSincePage(input, 20);
    expect(input.map((r) => r.id)).toEqual(["id0", "id1", "id2"]);
  });
});

describe("reconcileTimeline", () => {
  const items = (...ids: string[]) => ids.map((id) => ({ id }));
  const ids = (list: { id: string }[]) => list.map((i) => i.id);

  it("重なりあり: head を最新ページで作り直し・古い tail は維持・cursor据え置き", () => {
    // prev の a〜e に対し、最新ページ b,c,d（a が削除された想定）。重なり位置(=d)より古い e を残す。
    const prev = items("a", "b", "c", "d", "e");
    const res = reconcileTimeline(prev, items("b", "c", "d"), true, "cursorX");
    expect(ids(res.images)).toEqual(["b", "c", "d", "e"]);
    expect(res.keepCursor).toBe(true); // tail 末尾(e)不変 → cursor を触らない
    expect([...res.newIds]).toEqual([]); // 新規なし
  });

  it("削除された既存要素は落ちる（追加専用では消えなかった不具合の回帰防止）", () => {
    // prev に b があるが最新ページに b が無い（削除/非公開）→ 結果から消える。
    const prev = items("a", "b", "c", "d");
    const res = reconcileTimeline(prev, items("a", "c", "d"), true, null);
    expect(ids(res.images)).toEqual(["a", "c", "d"]); // b が消え、tail も維持されない位置なので落ちる
    expect([...res.newIds]).toEqual([]);
  });

  it("新着は先頭に加わり newIds に入る（にゅるっと追加）", () => {
    const prev = items("b", "c", "d");
    const res = reconcileTimeline(prev, items("x", "b", "c"), true, null);
    expect(ids(res.images)).toEqual(["x", "b", "c", "d"]);
    expect([...res.newIds]).toEqual(["x"]); // x のみ新規
  });

  it("重なり無し（新着が1ページ超で穴あき）: tail を捨て全差し替え・cursor更新", () => {
    const prev = items("d", "e", "f");
    const res = reconcileTimeline(prev, items("x", "y", "z"), true, "cursorNew");
    expect(ids(res.images)).toEqual(["x", "y", "z"]);
    expect(res.keepCursor).toBe(false);
    expect(res.cursor).toBe("cursorNew");
  });

  it("prev が空: 最新ページで作り直し・cursor更新", () => {
    const res = reconcileTimeline([], items("a", "b"), true, "c");
    expect(ids(res.images)).toEqual(["a", "b"]);
    expect(res.keepCursor).toBe(false);
    expect(res.cursor).toBe("c");
  });

  it("ページが全件（!hasMore）: tail を残さず作り直す（古い削除の居座り防止）・cursorはnull", () => {
    // prev に古い削除済み z が残っていても、全件ページなら落として真実に揃える。
    const prev = items("a", "b", "z");
    const res = reconcileTimeline(prev, items("a", "b"), false, "ignored");
    expect(ids(res.images)).toEqual(["a", "b"]);
    expect(res.keepCursor).toBe(false);
    expect(res.cursor).toBeNull();
  });
});
