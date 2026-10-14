import { describe, it, expect } from "vitest";
import { threadBrokenMessage } from "./threadBroken";

describe("threadBrokenMessage", () => {
  it("原因（削除・見つからない）を区別せず同じ文言にする", () => {
    expect(threadBrokenMessage("handon.club")).toBe(
      "スレッドの前の投稿が handon.club で見つかりませんでした"
    );
  });
});
