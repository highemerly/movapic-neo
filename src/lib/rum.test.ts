import { describe, it, expect, afterEach } from "vitest";
import { getRumOrigin, getRumBeaconUrl } from "./rum";

const original = process.env.RUM_ORIGIN;

afterEach(() => {
  if (original === undefined) delete process.env.RUM_ORIGIN;
  else process.env.RUM_ORIGIN = original;
});

describe("getRumOrigin", () => {
  it("未設定なら null（RUM無効）を返す", () => {
    delete process.env.RUM_ORIGIN;
    expect(getRumOrigin()).toBeNull();
  });

  it("空文字・空白のみなら null を返す", () => {
    process.env.RUM_ORIGIN = "   ";
    expect(getRumOrigin()).toBeNull();
  });

  it("オリジンをそのまま返す", () => {
    process.env.RUM_ORIGIN = "https://rum.piyo.me";
    expect(getRumOrigin()).toBe("https://rum.piyo.me");
  });

  it("末尾スラッシュやパスが付いていてもオリジンだけを返す", () => {
    process.env.RUM_ORIGIN = "https://rum.piyo.me/beacon.js";
    expect(getRumOrigin()).toBe("https://rum.piyo.me");
  });

  it("URL として不正なら例外を投げる", () => {
    process.env.RUM_ORIGIN = "rum.piyo.me";
    expect(() => getRumOrigin()).toThrow(/RUM_ORIGIN/);
  });

  it("http/https 以外のスキームは例外を投げる", () => {
    process.env.RUM_ORIGIN = "ftp://rum.piyo.me";
    expect(() => getRumOrigin()).toThrow(/http\/https/);
  });
});

describe("getRumBeaconUrl", () => {
  it("オリジン配下の beacon.js を返す", () => {
    process.env.RUM_ORIGIN = "https://rum.piyo.me";
    expect(getRumBeaconUrl()).toBe("https://rum.piyo.me/beacon.js");
  });

  it("未設定なら null を返す", () => {
    delete process.env.RUM_ORIGIN;
    expect(getRumBeaconUrl()).toBeNull();
  });
});
