import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getClientIp, rateLimitKey } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("10秒あたり2回まで許可、3回目は retryAfter つきで拒否", () => {
    const ip = "win-1";
    expect(checkRateLimit(ip)).toEqual({ allowed: true }); // t=0
    expect(checkRateLimit(ip)).toEqual({ allowed: true }); // t=0（2回目まではOK）
    // 3回目は拒否。最古(t=0)がウィンドウを抜ける t=10000 まで残り10秒
    expect(checkRateLimit(ip)).toEqual({ allowed: false, retryAfter: 10 });
    // 3秒経過で残り7秒（切り上げ）
    vi.advanceTimersByTime(3000);
    expect(checkRateLimit(ip)).toEqual({ allowed: false, retryAfter: 7 });
  });

  it("最古の記録がウィンドウを抜ければ1枠空く", () => {
    const ip = "win-2";
    expect(checkRateLimit(ip).allowed).toBe(true); // t=0
    vi.advanceTimersByTime(4000);
    expect(checkRateLimit(ip).allowed).toBe(true); // t=4000（2枠使用）
    expect(checkRateLimit(ip).allowed).toBe(false); // t=4000 3回目は拒否
    vi.advanceTimersByTime(6001); // t=10001（t=0 の記録がウィンドウ外に）
    expect(checkRateLimit(ip).allowed).toBe(true); // 1枠空いて許可
    // ただし t=4000 の記録はまだ生きているので、直後の追加は拒否
    expect(checkRateLimit(ip).allowed).toBe(false);
  });

  it("拒否されたリクエストは記録を増やさない（窓は許可された時刻基準）", () => {
    const ip = "win-3";
    expect(checkRateLimit(ip).allowed).toBe(true); // t=0
    expect(checkRateLimit(ip).allowed).toBe(true); // t=0
    vi.advanceTimersByTime(5000);
    expect(checkRateLimit(ip).allowed).toBe(false); // t=5000 拒否（記録しない）
    vi.advanceTimersByTime(5000); // t=10000（最初の2件がウィンドウ外に）
    expect(checkRateLimit(ip).allowed).toBe(true);
    expect(checkRateLimit(ip).allowed).toBe(true);
  });

  it("IPごとに独立して判定する", () => {
    expect(checkRateLimit("indep-a").allowed).toBe(true);
    expect(checkRateLimit("indep-a").allowed).toBe(true); // 同IP2回目まで許可
    expect(checkRateLimit("indep-b").allowed).toBe(true); // 別IPは影響を受けず許可
    expect(checkRateLimit("indep-a").allowed).toBe(false); // 同IP3回目は拒否
  });

  it("クリーンアップ間隔を超えても正常に判定できる（古いエントリのGC経路）", () => {
    // import 時刻より十分未来にして cleanup を確実に発火させる
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(checkRateLimit("gc-ip").allowed).toBe(true);
    vi.advanceTimersByTime(61_000); // TTL(60s)・cleanup間隔(60s)を超過
    // 古いエントリは掃除され、改めて許可される
    expect(checkRateLimit("gc-ip").allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  const reqWith = (headers: Record<string, string>) =>
    new Request("http://localhost/", { headers });

  it("cf-connecting-ip を最優先", () => {
    const req = reqWith({
      "cf-connecting-ip": "1.1.1.1",
      "x-forwarded-for": "2.2.2.2",
      "x-real-ip": "3.3.3.3",
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  it("x-forwarded-for は先頭IPを採用しトリムする", () => {
    expect(getClientIp(reqWith({ "x-forwarded-for": "  9.9.9.9 , 8.8.8.8 " }))).toBe("9.9.9.9");
  });

  it("x-real-ip にフォールバック", () => {
    expect(getClientIp(reqWith({ "x-real-ip": "4.4.4.4" }))).toBe("4.4.4.4");
  });

  it("いずれも無ければ unknown", () => {
    expect(getClientIp(reqWith({}))).toBe("unknown");
  });
});

describe("rateLimitKey", () => {
  it("IPv4 はアドレスそのまま", () => {
    expect(rateLimitKey("203.0.113.5")).toBe("203.0.113.5");
  });

  it("IPv6 は /64 にまとめる（下位64ビットを変えても同じキー）", () => {
    const a = rateLimitKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    const b = rateLimitKey("2001:db8:1:2::1");
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
  });

  it("別の /64 は別のキー", () => {
    expect(rateLimitKey("2001:db8:1:3::1")).not.toBe(rateLimitKey("2001:db8:1:2::1"));
  });

  it("省略形・先頭ゼロ・大文字の違いは同じキー", () => {
    expect(rateLimitKey("2001:DB8:0:0::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitKey("2001:0db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
  });

  it("IPv4 射影アドレスは IPv4 として数える", () => {
    expect(rateLimitKey("::ffff:203.0.113.5")).toBe("203.0.113.5");
  });

  it("ゾーンIDは落とす", () => {
    expect(rateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("IP でない値（unknown）はそのまま", () => {
    expect(rateLimitKey("unknown")).toBe("unknown");
  });
});

describe("checkRateLimit（IPv6）", () => {
  it("同じ /64 の別アドレスは同じ枠を使う", () => {
    expect(checkRateLimit("2001:db8:99:1::a").allowed).toBe(true);
    expect(checkRateLimit("2001:db8:99:1::b").allowed).toBe(true);
    expect(checkRateLimit("2001:db8:99:1::c").allowed).toBe(false);
  });
});
