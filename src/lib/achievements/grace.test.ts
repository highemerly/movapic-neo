import { afterEach, describe, expect, it, vi } from "vitest";
import { perfectMonthGrace } from "./grace";
import {
  PERFECT_MONTH_GRACE_FAVORED,
  PERFECT_MONTH_GRACE_DEFAULT,
} from "./perfectMonth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("perfectMonthGrace - 所属インスタンスで穴埋め枠が変わる", () => {
  it("FAVOR_SERVERS に含まれるサーバーは 4、その他は 3", () => {
    vi.stubEnv("FAVOR_SERVERS", "handon.club,friend.example");
    expect(perfectMonthGrace("handon.club")).toBe(PERFECT_MONTH_GRACE_FAVORED);
    expect(perfectMonthGrace("handon.club")).toBe(4);
    expect(perfectMonthGrace("mstdn.example")).toBe(PERFECT_MONTH_GRACE_DEFAULT);
    expect(perfectMonthGrace("mstdn.example")).toBe(3);
  });

  it("大文字ドメインでも一致する（小文字比較）", () => {
    vi.stubEnv("FAVOR_SERVERS", "handon.club");
    expect(perfectMonthGrace("Handon.club")).toBe(4);
  });

  it("FAVOR_SERVERS 未設定なら全員 3", () => {
    vi.stubEnv("FAVOR_SERVERS", "");
    expect(perfectMonthGrace("handon.club")).toBe(3);
  });

  it("null / undefined は特典扱いにせず 3", () => {
    vi.stubEnv("FAVOR_SERVERS", "handon.club");
    expect(perfectMonthGrace(null)).toBe(3);
    expect(perfectMonthGrace(undefined)).toBe(3);
  });
});
