import { describe, it, expect } from "vitest";
import {
  achievementPoints,
  totalXp,
  cumulativeXpForLevel,
  levelForXp,
  catalogProgress,
  collectionSummary,
  ACHIEVEMENT_POINTS,
} from "./score";

describe("achievementPoints", () => {
  it("皆勤賞は100ポイント", () => {
    expect(achievementPoints("perfect-month:2026-05", "perfect-month")).toBe(100);
    // category 未指定でもキー接頭辞で判定できる
    expect(achievementPoints("perfect-month:2026-05")).toBe(100);
  });

  it("シーズンは金扱いで80ポイント", () => {
    expect(achievementPoints("season:tanabata", "season")).toBe(80);
  });

  it("金の固定実績は80・銀は40", () => {
    expect(achievementPoints("posts:100")).toBe(ACHIEVEMENT_POINTS.gold); // 累計100枚=金
    expect(achievementPoints("first-post")).toBe(ACHIEVEMENT_POINTS.silver); // デビュー作=銀
  });
});

describe("totalXp", () => {
  it("獲得実績のポイントを合計する", () => {
    const xp = totalXp([
      { key: "perfect-month:2026-05", category: "perfect-month" }, // 100
      { key: "posts:100", category: "post-count" }, // 80
      { key: "first-post", category: "first-post" }, // 40
    ]);
    expect(xp).toBe(220);
  });
});

describe("cumulativeXpForLevel / levelForXp", () => {
  it("レベル到達に必要な累計XPが単調増加する", () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(2)).toBe(100);
    expect(cumulativeXpForLevel(3)).toBe(300);
    expect(cumulativeXpForLevel(4)).toBe(600);
  });

  it("XP=0 はLv.1・次まで100pt", () => {
    const l = levelForXp(0);
    expect(l.level).toBe(1);
    expect(l.intoLevel).toBe(0);
    expect(l.span).toBe(100);
    expect(l.toNext).toBe(100);
  });

  it("しきい値ちょうどで次レベルへ上がる", () => {
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(300).level).toBe(3);
  });

  it("レベル内の進捗を正しく分解する", () => {
    const l = levelForXp(250); // Lv2（base100, next300）
    expect(l.level).toBe(2);
    expect(l.intoLevel).toBe(150);
    expect(l.span).toBe(200);
    expect(l.toNext).toBe(50);
  });

  it("負・小数のXPも安全に丸める", () => {
    expect(levelForXp(-10).level).toBe(1);
    expect(levelForXp(120.9).xp).toBe(120);
  });
});

describe("catalogProgress", () => {
  it("固定カタログの実績だけを分子に数える（皆勤・シーズンは除外）", () => {
    const { achieved, total } = catalogProgress([
      { key: "first-post" },
      { key: "posts:100" },
      { key: "perfect-month:2026-05" }, // 動的：分子に数えない
      { key: "season:tanabata" }, // 動的：分子に数えない
    ]);
    expect(achieved).toBe(2);
    expect(total).toBeGreaterThan(2);
  });
});

describe("collectionSummary", () => {
  it("XP・レベル・金銀・皆勤月数・図鑑をまとめて返す", () => {
    const s = collectionSummary([
      { key: "perfect-month:2026-05", category: "perfect-month" },
      { key: "perfect-month:2026-06", category: "perfect-month" },
      { key: "posts:100", category: "post-count" },
      { key: "first-post", category: "first-post" },
    ]);
    expect(s.xp).toBe(320); // 100+100+80+40
    expect(s.perfectMonths).toBe(2);
    // 金＝皆勤2＋posts:100、銀＝first-post（countRanks と同一集計）
    expect(s.gold).toBe(3);
    expect(s.silver).toBe(1);
    expect(s.catalog.achieved).toBe(2); // 固定は posts:100 と first-post のみ
    expect(s.level.level).toBeGreaterThanOrEqual(3);
  });
});
