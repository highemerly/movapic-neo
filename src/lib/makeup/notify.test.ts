/**
 * 穴埋めを促す通知（notify.ts）のテスト。
 *
 * 仕様（2026-10 以降）:
 * - makeup-need-second: 残高1pt以上・穴1日以上・今日1枚目を投稿 → 「今日2枚目を投稿しよう」
 * - makeup-ready: 残高1pt以上・穴埋めが可能になった（今日2枚目を投稿／付与で残高ができた） → 「今すぐ穴埋めしよう」
 * どちらも1日1通。2026-09 以前の月は従来の makeup-reminder の担当なので、ここは何もしない。
 *
 * 上限（ledger）と prisma はモックし、「どの状態でどの通知を作るか」だけを検証する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { imageFindMany, notificationFindFirst, notificationCreate, resolveMakeupLimits } = vi.hoisted(() => ({
  imageFindMany: vi.fn(),
  notificationFindFirst: vi.fn(),
  notificationCreate: vi.fn(),
  resolveMakeupLimits: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    image: { findMany: imageFindMany },
    notification: { findFirst: notificationFindFirst, create: notificationCreate },
  },
}));
vi.mock("./ledger", () => ({ resolveMakeupLimits }));

import { notifyMakeupProgressOnPost, notifyMakeupReadyAfterGrant } from "./notify";

/** JST で 2026-10-DD の正午。 */
const jst = (day: number, month = 10) => new Date(Date.UTC(2026, month - 1, day, 3, 0, 0));
/** 月の画像行。targets は makeupTargetDay。 */
const rows = (entries: Array<[day: number, target?: number]>) =>
  entries.map(([day, target]) => ({
    createdAt: jst(day),
    makeupTargetDay: target ?? null,
    makeupTargetMonthDelta: 0,
  }));

/** 1〜4日は毎日投稿、2日だけ抜けている10月5日の状態に、今日(5日)の投稿を足す。 */
const withToday = (todayPosts: number, todayTarget?: number) =>
  rows([
    [1],
    [3],
    [4],
    ...Array.from({ length: todayPosts }, (_, i): [number, number?] =>
      i === todayPosts - 1 && todayTarget != null ? [5, todayTarget] : [5]
    ),
  ]);

const limits = (cap: number, potentialCap = cap) => ({ pointEra: true, cap, potentialCap, grants: [] });

beforeEach(() => {
  vi.clearAllMocks();
  notificationFindFirst.mockResolvedValue(null);
  notificationCreate.mockResolvedValue({});
  resolveMakeupLimits.mockResolvedValue(limits(1));
});

describe("notifyMakeupProgressOnPost - 投稿した瞬間の促し", () => {
  const post = (now: Date) => notifyMakeupProgressOnPost({ userId: "u1", imageId: "img", now });

  it("makeup-need-second: 今日1枚目・穴あり・残高あり → 今日2枚目を投稿しよう", async () => {
    imageFindMany.mockResolvedValue(withToday(1));

    await post(jst(5));

    expect(notificationCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        type: "makeup-need-second",
        achievementKey: "perfect-month:2026-10",
        imageId: "img",
      },
    });
  });

  it("makeup-ready: 今日2枚目・まだ割り当てていない → 今すぐ穴埋めしよう", async () => {
    imageFindMany.mockResolvedValue(withToday(2));

    await post(jst(5));

    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "makeup-ready" }) })
    );
  });

  it("今日の写真が既に穴を埋めていれば makeup-ready は出さない（1日1donor で今日はもう埋められない）", async () => {
    // 2日と3日が穴。今日の2枚目で2日を埋めたが3日がまだ残り、残高も1pt ある。
    // それでも今日の donor 枠は使用済みなので「今すぐ穴埋め」は出さない
    resolveMakeupLimits.mockResolvedValue(limits(2));
    imageFindMany.mockResolvedValue(rows([[1], [4], [5], [5, 2]]));

    await post(jst(5));

    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("残高0なら出さない（押せるボタンが無い）", async () => {
    resolveMakeupLimits.mockResolvedValue(limits(0, 2));
    imageFindMany.mockResolvedValue(withToday(1));

    await post(jst(5));

    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("穴が無ければ出さない", async () => {
    imageFindMany.mockResolvedValue(rows([[1], [2], [3], [4], [5]]));

    await post(jst(5));

    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("見込みを含めても皆勤不可能なら出さない（毎日つつかない）", async () => {
    resolveMakeupLimits.mockResolvedValue(limits(1, 1));
    // 2〜4日が穴（3日）で上限1
    imageFindMany.mockResolvedValue(rows([[1], [5]]));

    await post(jst(5));

    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("同じ種類の通知が今日すでにあれば出さない（1日1通・JST の今日0時以降で判定）", async () => {
    imageFindMany.mockResolvedValue(withToday(1));
    notificationFindFirst.mockResolvedValue({ id: "n1" });

    await post(jst(5));

    expect(notificationFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        type: "makeup-need-second",
        createdAt: { gte: new Date("2026-10-04T15:00:00Z") },
      },
      select: { id: true },
    });
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("2026-09 以前の月は何もしない（従来の makeup-reminder の担当）", async () => {
    await post(jst(20, 9));

    expect(resolveMakeupLimits).not.toHaveBeenCalled();
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});

describe("notifyMakeupReadyAfterGrant - 付与した直後の促し", () => {
  it("今日の投稿でなくても、未割当のダブル投稿日より前に穴があれば makeup-ready を出す", async () => {
    // 11日に catchup が来た。8日にダブル投稿済み・3日が穴
    imageFindMany.mockResolvedValue(
      rows([[1], [2], [4], [5], [6], [7], [8], [8], [9], [10], [11]])
    );

    await notifyMakeupReadyAfterGrant({ userId: "u1", ym: "2026-10", now: jst(11) });

    expect(notificationCreate).toHaveBeenCalledWith({
      data: { userId: "u1", type: "makeup-ready", achievementKey: "perfect-month:2026-10", imageId: null },
    });
  });

  it("穴より後にダブル投稿日が無ければ出さない（付与通知だけ）", async () => {
    imageFindMany.mockResolvedValue(rows([[1], [2], [4], [5]]));

    await notifyMakeupReadyAfterGrant({ userId: "u1", ym: "2026-10", now: jst(11) });

    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("当月以外への付与では出さない", async () => {
    await notifyMakeupReadyAfterGrant({ userId: "u1", ym: "2026-10", now: jst(3, 11) });

    expect(imageFindMany).not.toHaveBeenCalled();
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});
