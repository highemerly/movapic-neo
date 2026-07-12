import { describe, it, expect } from "vitest";
import {
  CATALOG,
  CATALOG_BY_KEY,
  LADDER_META,
  ACHIEVEMENT_LAYOUT,
  resolveAchievement,
  countRanks,
  evaluateSeason,
  evaluatePerfectMonth,
  PERFECT_MONTH_CATEGORY,
  SEASON_CATEGORY,
  type AchStats,
  type PostFacts,
} from "./catalog";

const bareStats = (dayCounts: Record<number, number>): AchStats =>
  ({ postMonthDayCounts: dayCounts, filledHoleDays: [] } as unknown as AchStats);

const barePost = (o: Partial<PostFacts> = {}): PostFacts =>
  ({ season: null, createdAt: new Date("2026-06-15T03:00:00Z"), ...o } as PostFacts);

describe("resolveAchievement", () => {
  it("固定実績はカタログ定義に解決する", () => {
    const r = resolveAchievement("posts:100");
    expect(r).toMatchObject({ category: "post-count", rank: "gold", section: "投稿数", title: "写真師範" });
    expect(resolveAchievement("first-post").rank).toBe("silver");
  });

  it("シーズン（動的キー）は gold・期間限定", () => {
    const r = resolveAchievement("season:tanabata");
    expect(r.category).toBe(SEASON_CATEGORY);
    expect(r.rank).toBe("gold");
    expect(r.section).toBe("期間限定");
    expect(r.title.length).toBeGreaterThan(0);
  });

  it("皆勤賞（動的キー）は gold・年月ラベル", () => {
    const r = resolveAchievement("perfect-month:2026-06");
    expect(r).toMatchObject({ category: PERFECT_MONTH_CATEGORY, rank: "gold", section: "皆勤賞" });
    expect(r.title).toBe("2026年6月の皆勤賞");
  });

  it("未知キーは silver フォールバック（category 引数を尊重）", () => {
    const r = resolveAchievement("mystery-key", "weird");
    expect(r).toMatchObject({ rank: "silver", category: "weird", title: "mystery-key" });
  });
});

describe("countRanks", () => {
  it("金/銀を集計する（動的キー含む）", () => {
    const items = [
      { key: "posts:100", category: "post-count" }, // gold
      { key: "posts:50", category: "post-count" }, // silver
      { key: "first-post", category: "first-post" }, // silver
      { key: "perfect-month:2026-06", category: PERFECT_MONTH_CATEGORY }, // gold
      { key: "season:tanabata", category: SEASON_CATEGORY }, // gold
    ];
    expect(countRanks(items)).toEqual({ gold: 3, silver: 2 });
  });

  it("空なら 0/0", () => {
    expect(countRanks([])).toEqual({ gold: 0, silver: 0 });
  });
});

describe("evaluateSeason", () => {
  it("season の有無で season:<key> か null", () => {
    expect(evaluateSeason(barePost({ season: "tanabata" }))).toBe("season:tanabata");
    expect(evaluateSeason(barePost({ season: null }))).toBeNull();
  });
});

describe("evaluatePerfectMonth", () => {
  it("全日投稿なら perfect-month:YYYY-MM、欠ければ null", () => {
    const full: Record<number, number> = {};
    for (let d = 1; d <= 30; d++) full[d] = 1; // 2026-06 は30日
    expect(evaluatePerfectMonth(bareStats(full), barePost(), 3)).toBe("perfect-month:2026-06");

    const holey = { ...full };
    delete holey[10];
    delete holey[11];
    delete holey[12];
    delete holey[13]; // 4日欠け（grace=3超）
    expect(evaluatePerfectMonth(bareStats(holey), barePost(), 3)).toBeNull();
  });
});

describe("カタログ構造の不変条件（key の永続性・参照整合）", () => {
  it("CATALOG のキーは一意で CATALOG_BY_KEY と一致する", () => {
    const keys = CATALOG.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CATALOG_BY_KEY.size).toBe(CATALOG.length);
    for (const d of CATALOG) expect(CATALOG_BY_KEY.get(d.key)).toBe(d);
  });

  it("ladderKey を持つ定義は必ず LADDER_META に登録がある", () => {
    for (const d of CATALOG) {
      if (d.ladderKey) expect(LADDER_META[d.ladderKey], `${d.key}`).toBeDefined();
    }
  });

  it("同一ラダー内の tier は昇順（進捗表示の前提）", () => {
    const byLadder = new Map<string, number[]>();
    for (const d of CATALOG) {
      if (d.ladderKey && d.tier != null) {
        (byLadder.get(d.ladderKey) ?? byLadder.set(d.ladderKey, []).get(d.ladderKey)!).push(d.tier);
      }
    }
    for (const [, tiers] of byLadder) {
      const sorted = [...tiers].sort((a, b) => a - b);
      expect(tiers).toEqual(sorted);
    }
  });

  it("ACHIEVEMENT_LAYOUT の参照が全て解決する（single=key / ladder=ladderKey）", () => {
    const ladderKeys = new Set(CATALOG.map((d) => d.ladderKey).filter(Boolean));
    for (const section of ACHIEVEMENT_LAYOUT) {
      for (const block of section.blocks) {
        if (block.kind === "single") {
          expect(CATALOG_BY_KEY.has(block.key), block.key).toBe(true);
        } else if (block.kind === "ladder") {
          expect(ladderKeys.has(block.ladderKey), block.ladderKey).toBe(true);
        }
      }
    }
  });

  it("固定実績は resolveAchievement で自身の rank/category に解決する（往復整合）", () => {
    for (const d of CATALOG) {
      const r = resolveAchievement(d.key);
      expect(r.rank).toBe(d.rank);
      expect(r.category).toBe(d.category);
    }
  });
});
