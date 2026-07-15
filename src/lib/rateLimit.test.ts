import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getClientIp } from "./rateLimit";

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
