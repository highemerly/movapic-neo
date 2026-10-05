import { describe, it, expect, afterEach } from "vitest";
import { isRumEnabled, getRumBeaconUrl } from "./rum";

const original = process.env.RUM_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.RUM_ENABLED;
  else process.env.RUM_ENABLED = original;
});

describe("isRumEnabled", () => {
  it("未設定なら false（RUM無効）を返す", () => {
    delete process.env.RUM_ENABLED;
    expect(isRumEnabled()).toBe(false);
  });

  it("空文字・空白のみなら false を返す", () => {
    process.env.RUM_ENABLED = "   ";
    expect(isRumEnabled()).toBe(false);
  });

  it("\"1\" なら true を返す", () => {
    process.env.RUM_ENABLED = "1";
    expect(isRumEnabled()).toBe(true);
  });

  it("\"1\" 以外の値は例外を投げる", () => {
    process.env.RUM_ENABLED = "true";
    expect(() => isRumEnabled()).toThrow(/RUM_ENABLED/);
  });

  it("旧 RUM_ORIGIN 相当の値（URL）を入れても例外を投げる", () => {
    process.env.RUM_ENABLED = "https://rum.piyo.me";
    expect(() => isRumEnabled()).toThrow(/RUM_ENABLED/);
  });
});

describe("getRumBeaconUrl", () => {
  it("有効なら同一オリジンの /_n-rum/beacon.js を返す", () => {
    process.env.RUM_ENABLED = "1";
    expect(getRumBeaconUrl()).toBe("/_n-rum/beacon.js");
  });

  it("未設定なら null を返す", () => {
    delete process.env.RUM_ENABLED;
    expect(getRumBeaconUrl()).toBeNull();
  });
});
