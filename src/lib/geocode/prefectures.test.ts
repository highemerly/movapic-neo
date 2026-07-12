import { describe, it, expect } from "vitest";
import { PREFECTURES, PREFECTURE_BY_CODE, JAPAN_TILE_GRID } from "./prefectures";

describe("PREFECTURES", () => {
  it("47都道府県が JIS コード順（01〜47）で並ぶ", () => {
    expect(PREFECTURES).toHaveLength(47);
    PREFECTURES.forEach((p, i) => {
      expect(p.code).toBe(String(i + 1).padStart(2, "0"));
    });
  });

  it("コード・名称に重複がない", () => {
    expect(new Set(PREFECTURES.map((p) => p.code)).size).toBe(47);
    expect(new Set(PREFECTURES.map((p) => p.name)).size).toBe(47);
  });
});

describe("PREFECTURE_BY_CODE", () => {
  it("コードから都道府県を引ける", () => {
    expect(PREFECTURE_BY_CODE["01"].name).toBe("北海道");
    expect(PREFECTURE_BY_CODE["13"].name).toBe("東京都");
    expect(PREFECTURE_BY_CODE["47"].name).toBe("沖縄県");
  });
});

describe("JAPAN_TILE_GRID（タイルカルトグラム）", () => {
  it("11行 × 13列", () => {
    expect(JAPAN_TILE_GRID).toHaveLength(11);
    for (const row of JAPAN_TILE_GRID) {
      expect(row).toHaveLength(13);
    }
  });

  it("47コードが過不足なく1回ずつ配置され、未知コードを含まない", () => {
    const cells = JAPAN_TILE_GRID.flat().filter((c): c is string => c !== null);
    expect(cells).toHaveLength(47);
    expect(new Set(cells)).toEqual(new Set(PREFECTURES.map((p) => p.code)));
  });

  it("北海道は右上・沖縄は左下に置かれる", () => {
    expect(JAPAN_TILE_GRID[0][12]).toBe("01"); // 北海道
    expect(JAPAN_TILE_GRID[10][0]).toBe("47"); // 沖縄
  });
});
