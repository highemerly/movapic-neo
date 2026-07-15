import { describe, it, expect } from "vitest";
import {
  MUTE_DURATIONS,
  durationToExpiresAt,
  isMuteDuration,
} from "./muteDurations";

describe("isMuteDuration", () => {
  it("有効な期間キーを受け付ける", () => {
    for (const d of MUTE_DURATIONS) {
      expect(isMuteDuration(d)).toBe(true);
    }
  });

  it("未知の値・非文字列は拒否する", () => {
    expect(isMuteDuration("3d")).toBe(false);
    expect(isMuteDuration("")).toBe(false);
    expect(isMuteDuration(7)).toBe(false);
    expect(isMuteDuration(undefined)).toBe(false);
    expect(isMuteDuration(null)).toBe(false);
  });
});

describe("durationToExpiresAt", () => {
  const now = new Date("2026-07-15T00:00:00.000Z");

  it("無期は null を返す", () => {
    expect(durationToExpiresAt("indefinite", now)).toBeNull();
  });

  it("有期は now + 日数 の絶対時刻を返す", () => {
    expect(durationToExpiresAt("1d", now)?.toISOString()).toBe(
      "2026-07-16T00:00:00.000Z"
    );
    expect(durationToExpiresAt("7d", now)?.toISOString()).toBe(
      "2026-07-22T00:00:00.000Z"
    );
    expect(durationToExpiresAt("30d", now)?.toISOString()).toBe(
      "2026-08-14T00:00:00.000Z"
    );
    expect(durationToExpiresAt("90d", now)?.toISOString()).toBe(
      "2026-10-13T00:00:00.000Z"
    );
  });
});
