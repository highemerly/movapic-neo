import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

// 境界（DB）を先頭でモックして外部を一切読ませない。トランザクションは同じモックを tx として渡す。
vi.mock("@/lib/db", () => {
  const db = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    dayBoundarySetting: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return { default: db };
});

import prisma from "@/lib/db";
import { asPostDate } from "./dayClock";
import { changeDayBoundary, fromDbDate, loadSchedule, toDbDate } from "./dayClock.server";

const findMany = vi.mocked(prisma.dayBoundarySetting.findMany);
const deleteMany = vi.mocked(prisma.dayBoundarySetting.deleteMany);
const create = vi.mocked(prisma.dayBoundarySetting.create);
const queryRaw = vi.mocked(prisma.$queryRaw);

const dbRow = (fromDate: string, hour: number) => ({ fromDate: new Date(`${fromDate}T00:00:00Z`), hour });

// DATE 列の変換がローカル時刻に依存しないことを、UTC でも JST でもない TZ で確かめる。
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("DATE 列の変換", () => {
  it("toDbDate は UTC 0:00、fromDbDate はその日付に戻す", () => {
    const d = asPostDate("2026-11-01");
    expect(toDbDate(d).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(fromDbDate(toDbDate(d))).toBe("2026-11-01");
  });
});

describe("loadSchedule", () => {
  it("行を記録日の文字列にして返す", async () => {
    findMany.mockResolvedValue([dbRow("2026-11-01", 2), dbRow("2026-11-10", 0)] as never);
    await expect(loadSchedule("u1")).resolves.toEqual([
      { fromDate: "2026-11-01", hour: 2 },
      { fromDate: "2026-11-10", hour: 0 },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
  });
});

describe("changeDayBoundary", () => {
  it("ロックを取ってから読み、明日以降の行を消して足す", async () => {
    vi.setSystemTime(new Date("2026-11-08T15:00:00+09:00"));
    findMany.mockResolvedValue([dbRow("2026-11-01", 2), dbRow("2026-11-12", 4)] as never);

    const { schedule, now } = await changeDayBoundary("u1", 3);

    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0]);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", fromDate: { gte: new Date("2026-11-09T00:00:00Z") } },
    });
    expect(create).toHaveBeenCalledWith({
      data: { userId: "u1", fromDate: new Date("2026-11-09T00:00:00Z"), hour: 3 },
    });
    expect(schedule).toEqual([
      { fromDate: "2026-11-01", hour: 2 },
      { fromDate: "2026-11-09", hour: 3 },
    ]);
    expect(now.toISOString()).toBe("2026-11-08T06:00:00.000Z");
  });

  it("今と同じ区切りなら予約を消すだけで足さない", async () => {
    vi.setSystemTime(new Date("2026-11-08T15:00:00+09:00"));
    findMany.mockResolvedValue([dbRow("2026-11-01", 2), dbRow("2026-11-09", 4)] as never);

    const { schedule } = await changeDayBoundary("u1", 2);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(schedule).toEqual([{ fromDate: "2026-11-01", hour: 2 }]);
  });
});
