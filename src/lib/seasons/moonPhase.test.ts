import { describe, it, expect } from "vitest";
import { moonAge, illuminatedFraction, moonAppearance } from "./moonPhase";

const SYNODIC_MONTH = 29.530588853;

describe("moonAge", () => {
  it("基準新月の瞬間はほぼ0", () => {
    expect(moonAge(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toBeCloseTo(0, 5);
  });

  it("基準より前の日時でも0以上・朔望月未満に収まる", () => {
    const age = moonAge(new Date(Date.UTC(1985, 5, 3)));
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(SYNODIC_MONTH);
  });
});

describe("illuminatedFraction", () => {
  it("新月は0・満月は1", () => {
    const newMoon = Date.UTC(2000, 0, 6, 18, 14);
    expect(illuminatedFraction(new Date(newMoon))).toBeCloseTo(0, 5);
    expect(
      illuminatedFraction(new Date(newMoon + (SYNODIC_MONTH / 2) * 86_400_000))
    ).toBeCloseTo(1, 5);
  });

  it("2026年の中秋の名月（9/25）から満月（9/26）にかけてほぼ真円になる", () => {
    expect(illuminatedFraction(new Date("2026-09-25T12:00:00Z"))).toBeGreaterThan(0.98);
    expect(illuminatedFraction(new Date("2026-09-26T12:00:00Z"))).toBeGreaterThan(0.99);
  });
});

describe("moonAppearance", () => {
  it("満ちていく月は左が欠け、欠けていく月は右が欠ける", () => {
    const newMoon = Date.UTC(2000, 0, 6, 18, 14);
    expect(moonAppearance(new Date(newMoon + 7 * 86_400_000)).darkLimb).toBe("left");
    expect(moonAppearance(new Date(newMoon + 22 * 86_400_000)).darkLimb).toBe("right");
  });

  it("満月は真円（比1）になる", () => {
    const fullMoon = Date.UTC(2000, 0, 6, 18, 14) + (SYNODIC_MONTH / 2) * 86_400_000;
    expect(moonAppearance(new Date(fullMoon)).terminatorRatio).toBeCloseTo(1, 4);
  });

  it("満月寄りに丸めるので、半月でも実際より膨らんだ形になる", () => {
    const halfMoon = Date.UTC(2000, 0, 6, 18, 14) + (SYNODIC_MONTH / 4) * 86_400_000;
    const d = new Date(halfMoon);
    expect(illuminatedFraction(d)).toBeCloseTo(0.5, 4); // 実際は半月
    expect(moonAppearance(d).terminatorRatio).toBeGreaterThan(0.6); // 描くのは太った月
  });

  it("シーズン期間（2026/9/10〜9/27）は新月の日でも半月より膨らんでいる", () => {
    for (let day = 10; day <= 27; day++) {
      const d = new Date(Date.UTC(2026, 8, day, 12, 0));
      expect(moonAppearance(d).terminatorRatio).toBeGreaterThan(0.25);
    }
  });

  // 新月の瞬間はシーズン初日の翌日（9/11）にあるため、満ちていくのはそこから。
  it("新月（9/11）を過ぎると日を追うごとに満ちて、満月（9/26）で真円になる", () => {
    const ratio = (day: number) =>
      moonAppearance(new Date(Date.UTC(2026, 8, day, 12, 0))).terminatorRatio;
    for (let day = 12; day <= 26; day++) {
      expect(ratio(day)).toBeGreaterThan(ratio(day - 1));
    }
    expect(ratio(26)).toBeCloseTo(1, 1);
  });
});
