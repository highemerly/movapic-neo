import { describe, it, expect } from "vitest";
import {
  budgetFromMemoryLimit,
  createMemoryBudget,
  parseCgroupMemoryLimit,
} from "./decodeBudget";
import { estimateDecodeMB } from "./decodeLimits";

/** 未解決の Promise を進める（acquire の解決はマイクロタスク） */
const flush = () => new Promise((r) => setTimeout(r, 0));

function track(p: Promise<() => void>) {
  const state: { release?: () => void; error?: unknown } = {};
  p.then(
    (release) => (state.release = release),
    (error) => (state.error = error)
  );
  return state;
}

describe("createMemoryBudget", () => {
  it("予算内なら並列に入れる", async () => {
    const budget = createMemoryBudget(1000);
    const a = track(budget.acquire(300));
    const b = track(budget.acquire(300));
    const c = track(budget.acquire(300));
    await flush();
    expect([a.release, b.release, c.release].every(Boolean)).toBe(true);
    expect(budget.inUseMB()).toBe(900);
  });

  it("予算を超える分は待ち、解放されたら入る", async () => {
    const budget = createMemoryBudget(1000);
    const a = track(budget.acquire(700));
    const b = track(budget.acquire(700));
    await flush();
    expect(a.release).toBeDefined();
    expect(b.release).toBeUndefined();
    expect(budget.waiting()).toBe(1);

    a.release!();
    await flush();
    expect(b.release).toBeDefined();
    expect(budget.inUseMB()).toBe(700);
  });

  it("何も処理していなければ予算を超える見積もりでも1件は入る", async () => {
    const budget = createMemoryBudget(1000);
    const a = track(budget.acquire(1500));
    const b = track(budget.acquire(10));
    await flush();
    expect(a.release).toBeDefined();
    expect(b.release).toBeUndefined();
  });

  it("先頭が待っている間は、後ろの小さいものも追い越さない（到着順）", async () => {
    const budget = createMemoryBudget(1000);
    const a = track(budget.acquire(600));
    const big = track(budget.acquire(600));
    const small = track(budget.acquire(100));
    await flush();
    expect(a.release).toBeDefined();
    expect(big.release).toBeUndefined();
    expect(small.release).toBeUndefined();

    a.release!();
    await flush();
    expect(big.release).toBeDefined();
    expect(small.release).toBeDefined();
  });

  it("release を二度呼んでも二重に戻さない", async () => {
    const budget = createMemoryBudget(1000);
    const a = track(budget.acquire(400));
    const b = track(budget.acquire(400));
    await flush();
    a.release!();
    a.release!();
    expect(budget.inUseMB()).toBe(400);
    b.release!();
    expect(budget.inUseMB()).toBe(0);
  });

  it("待っている間に abort されたら列から外れ、後ろが入れるようになる", async () => {
    const budget = createMemoryBudget(1000);
    const a = track(budget.acquire(600));
    const controller = new AbortController();
    const big = track(budget.acquire(600, controller.signal));
    const small = track(budget.acquire(300));
    await flush();
    expect(small.release).toBeUndefined();

    controller.abort();
    await flush();
    expect(big.error).toBeDefined();
    expect(small.release).toBeDefined();
    expect(budget.waiting()).toBe(0);
    expect(budget.inUseMB()).toBe(900);
    a.release!();
  });

  it("入った後の abort は何もしない（解放は release で行う）", async () => {
    const budget = createMemoryBudget(1000);
    const controller = new AbortController();
    const a = track(budget.acquire(600, controller.signal));
    await flush();
    controller.abort();
    await flush();
    expect(a.error).toBeUndefined();
    expect(budget.inUseMB()).toBe(600);
  });

  it("既に abort 済みなら待たずに reject", async () => {
    const budget = createMemoryBudget(1000);
    const controller = new AbortController();
    controller.abort();
    const a = track(budget.acquire(100, controller.signal));
    await flush();
    expect(a.error).toBeDefined();
    expect(budget.inUseMB()).toBe(0);
  });
});

describe("parseCgroupMemoryLimit", () => {
  it("cgroup v2 の上限（バイト数）を読む", () => {
    expect(parseCgroupMemoryLimit("1610612736\n")).toBe(1536 * 1024 * 1024);
  });

  it("v2 の max は上限なし", () => {
    expect(parseCgroupMemoryLimit("max\n")).toBeUndefined();
  });

  it("v1 の上限なし（巨大値）は上限なし", () => {
    expect(parseCgroupMemoryLimit("9223372036854771712\n")).toBeUndefined();
  });

  it("読めない値は上限なし", () => {
    expect(parseCgroupMemoryLimit("")).toBeUndefined();
    expect(parseCgroupMemoryLimit("abc")).toBeUndefined();
  });
});

describe("budgetFromMemoryLimit", () => {
  it("上限から固定の取り置き（常駐＋余裕）を引く", () => {
    expect(budgetFromMemoryLimit(1536 * 1024 * 1024)).toBe(1152);
    expect(budgetFromMemoryLimit(2048 * 1024 * 1024)).toBe(1664);
  });

  it("上限なしなら予算も無し（待たせない）", () => {
    expect(budgetFromMemoryLimit(undefined)).toBe(Infinity);
  });

  it("取り置きより小さい上限は 0（何もしていないときに1件ずつ通す）", () => {
    expect(budgetFromMemoryLimit(256 * 1024 * 1024)).toBe(0);
  });
});

describe("上限 1536Mi での予算と見積もりの組み合わせ（2026-11-10 の実測）", () => {
  // 実測: 79MP AVIF 2枚同時で OOM、48MP AVIF 2枚同時でピーク 1354MiB（上限 1536Mi 寸前）、
  // 12MP の JPEG・AVIF 4枚同時はピーク 900MiB 前後で余裕がある。
  const budget = budgetFromMemoryLimit(1536 * 1024 * 1024);

  it("79MP の AVIF は2枚同時に入れない", () => {
    const cost = estimateDecodeMB({ format: "heif", width: 8900, height: 8900 });
    expect(cost * 2).toBeGreaterThan(budget);
  });

  it("48MP の AVIF（iPhone の HEIC 相当）も2枚同時には入れない", () => {
    const cost = estimateDecodeMB({ format: "heif", width: 8064, height: 6048 });
    expect(cost * 2).toBeGreaterThan(budget);
  });

  it("12MP の写真は JPEG・AVIF とも4枚同時に入る", () => {
    for (const format of ["jpeg", "heif"]) {
      const cost = estimateDecodeMB({ format, width: 4032, height: 3024 });
      expect(cost * 4).toBeLessThanOrEqual(budget);
    }
  });
});
