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

  it("初回は許可、8秒以内の再アクセスは retryAfter つきで拒否", () => {
    const ip = "win-1";
    expect(checkRateLimit(ip)).toEqual({ allowed: true });
    // 直後は残り8秒
    expect(checkRateLimit(ip)).toEqual({ allowed: false, retryAfter: 8 });
    // 3秒経過で残り5秒（切り上げ）
    vi.advanceTimersByTime(3000);
    expect(checkRateLimit(ip)).toEqual({ allowed: false, retryAfter: 5 });
  });

  it("8秒経過後は再び許可される", () => {
    const ip = "win-2";
    expect(checkRateLimit(ip).allowed).toBe(true);
    vi.advanceTimersByTime(8000);
    expect(checkRateLimit(ip).allowed).toBe(true);
  });

  it("拒否されたリクエストは基準時刻を更新しない（窓は初回許可からの8秒）", () => {
    const ip = "win-3";
    expect(checkRateLimit(ip).allowed).toBe(true); // t=0 記録
    vi.advanceTimersByTime(5000);
    expect(checkRateLimit(ip).allowed).toBe(false); // 拒否（更新しない）
    vi.advanceTimersByTime(3000); // t=8000（初回から8秒）
    expect(checkRateLimit(ip).allowed).toBe(true);
  });

  it("IPごとに独立して判定する", () => {
    expect(checkRateLimit("indep-a").allowed).toBe(true);
    expect(checkRateLimit("indep-b").allowed).toBe(true); // 別IPは即許可
    expect(checkRateLimit("indep-a").allowed).toBe(false); // 同IPは拒否
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
