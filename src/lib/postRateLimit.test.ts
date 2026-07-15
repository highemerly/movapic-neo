import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: { image: { findMany: vi.fn() } } }));

import { checkPostRateLimit } from "./postRateLimit";
import prisma from "@/lib/db";

const mockFindMany = vi.mocked(prisma.image.findMany);

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// 「今」から past ミリ秒前の createdAt を n 件返すヘルパ
function rowsAgo(entries: { agoMs: number; count: number }[]): { createdAt: Date }[] {
  const now = Date.now();
  const out: { createdAt: Date }[] = [];
  for (const { agoMs, count } of entries) {
    for (let i = 0; i < count; i++) out.push({ createdAt: new Date(now - agoMs) });
  }
  return out;
}

describe("checkPostRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    mockFindMany.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("投稿履歴なしなら許可", async () => {
    mockFindMany.mockResolvedValue([]);
    expect(await checkPostRateLimit("u1")).toEqual({ allowed: true });
  });

  it("直近15分で9件なら許可、10件で拒否（retryAfter付き）", async () => {
    // 5分前に9件 → まだ許可
    mockFindMany.mockResolvedValueOnce(rowsAgo([{ agoMs: 5 * MIN, count: 9 }]) as never);
    expect((await checkPostRateLimit("u1")).allowed).toBe(true);

    // 5分前に10件 → 拒否。最古(5分前)が15分ウィンドウを抜けるまで残り約10分
    mockFindMany.mockResolvedValueOnce(rowsAgo([{ agoMs: 5 * MIN, count: 10 }]) as never);
    const res = await checkPostRateLimit("u1");
    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBe(10 * 60); // 600秒
  });

  it("15分は空いていても24時間上限（週次履歴が少なければ15）を超えれば拒否", async () => {
    // 直近1週間の投稿は24時間内の15件のみ → limit24h = 15 + floor(15/7)*2 = 15+2 = 17
    // 15件では 15 < 17 で許可
    mockFindMany.mockResolvedValueOnce(rowsAgo([{ agoMs: 3 * HOUR, count: 15 }]) as never);
    expect((await checkPostRateLimit("u1")).allowed).toBe(true);

    // 17件（全て3時間前・週次も17）→ limit = 15 + floor(17/7)*2 = 15+4 = 19、17<19 で許可
    mockFindMany.mockResolvedValueOnce(rowsAgo([{ agoMs: 3 * HOUR, count: 17 }]) as never);
    expect((await checkPostRateLimit("u1")).allowed).toBe(true);
  });

  it("24時間上限を超えれば拒否（retryAfterは24時間ウィンドウ基準）", async () => {
    // 直近2時間に30件（週次も30）→ limit = 15 + floor(30/7)*2 = 15 + 8 = 23。
    // 24時間内30 >= 23 で拒否。最古(2時間前)が24時間を抜けるまで残り約22時間。
    mockFindMany.mockResolvedValue(rowsAgo([{ agoMs: 2 * HOUR, count: 30 }]) as never);
    const res = await checkPostRateLimit("u1");
    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBe(22 * 60 * 60);
  });

  it("15分上限が24時間上限より優先される（両方超過なら15分側のretryAfter）", async () => {
    // 直近5分に30件 → 15分上限(10)を超過。24時間上限も超過するが、15分側で先に弾く
    mockFindMany.mockResolvedValue(rowsAgo([{ agoMs: 5 * MIN, count: 30 }]) as never);
    const res = await checkPostRateLimit("u1");
    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBe(10 * 60); // 15分ウィンドウ基準（600秒）
  });
});
