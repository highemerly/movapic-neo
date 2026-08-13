import { describe, it, expect } from "vitest";
import { bucketKey } from "./publicStats";

describe("bucketKey", () => {
  const tiers = [5, 10, 20];

  it("最小境界（1）未満はどのバケットにも入らない", () => {
    expect(bucketKey(0, tiers)).toBeNull();
    expect(bucketKey(-1, tiers)).toBeNull();
  });

  it("しきい値未満は直下の境界のバケットに入る", () => {
    expect(bucketKey(1, tiers)).toBe("b1");
    expect(bucketKey(4, tiers)).toBe("b1");
    expect(bucketKey(5, tiers)).toBe("b5");
    expect(bucketKey(9, tiers)).toBe("b5");
  });

  it("最大境界以上は最上位のバケットに入る", () => {
    expect(bucketKey(20, tiers)).toBe("b20");
    expect(bucketKey(9999, tiers)).toBe("b20");
  });

  it("しきい値に1が含まれても重複したバケットにならない", () => {
    expect(bucketKey(1, [1, 5, 30, 100])).toBe("b1");
    expect(bucketKey(30, [1, 5, 30, 100])).toBe("b30");
  });

  it("数値でない値はどのバケットにも入らない", () => {
    expect(bucketKey(Number.NaN, tiers)).toBeNull();
  });
});
