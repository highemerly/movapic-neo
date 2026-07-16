import { describe, it, expect } from "vitest";
import { ladderNextGoals } from "./nextGoals";

describe("ladderNextGoals", () => {
  it("未獲得の最も下の段を次のゴールにする", () => {
    // posts:5〜50 を獲得済み → 次は 100枚
    const granted = new Set(["posts:5", "posts:10", "posts:20", "posts:30", "posts:50"]);
    const goals = ladderNextGoals(granted, { "post-count": 87 });
    const post = goals.find((g) => g.ladderKey === "post-count");
    expect(post).toBeDefined();
    expect(post!.target).toBe(100);
    expect(post!.current).toBe(87);
    expect(post!.remaining).toBe(13);
    expect(post!.unit).toBe("投稿");
    expect(post!.ratio).toBeCloseTo(0.87, 5);
  });

  it("達成率が高い順に並ぶ", () => {
    const goals = ladderNextGoals(new Set(), {
      "post-count": 4, // 次5 → 0.8
      cameras: 0, // 次2 → 0
    });
    const idxPost = goals.findIndex((g) => g.ladderKey === "post-count");
    const idxCam = goals.findIndex((g) => g.ladderKey === "cameras");
    expect(idxPost).toBeLessThan(idxCam);
  });

  it("全段達成済みのラダーは対象外", () => {
    // colors は tier 4,8 の2段。両方獲得済みなら出さない
    const granted = new Set(["colors:4", "colors:8"]);
    const goals = ladderNextGoals(granted, { colors: 10 });
    expect(goals.some((g) => g.ladderKey === "colors")).toBe(false);
  });

  it("値の無いラダーは現在値0として扱う", () => {
    const goals = ladderNextGoals(new Set(), {});
    const cam = goals.find((g) => g.ladderKey === "cameras");
    expect(cam).toBeDefined();
    expect(cam!.current).toBe(0);
    expect(cam!.remaining).toBe(cam!.target);
  });
});
