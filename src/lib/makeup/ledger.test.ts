/**
 * 穴埋めポイント台帳（ledger.ts）のユニットテスト。
 *
 * ここは「その月に穴埋めできる上限（cap）」を決める唯一の場所。カレンダー表示・皆勤賞判定・
 * 割当の上限チェック・通知ゲートがすべてここで解決した値を使うため、era の切り替え（2026-09 以前は
 * 所属インスタンスの固定値／2026-10 以降は台帳の合計）を取り違えると全経路が一斉にずれる。
 *
 * 付与（grantMakeupPoints）は30分ごとの定期ジョブから何度も呼ばれるので、
 * 「2回目は何も書かない」「通知が台帳と別々に重複しない」を重点的に固定する。
 * prisma と env 依存の grace はモックする。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { aggregate, grantFindMany, grantCreate, notificationCreate, userFindUnique, achievementFindFirst, transaction } =
  vi.hoisted(() => ({
    aggregate: vi.fn(),
    grantFindMany: vi.fn(),
    grantCreate: vi.fn((arg) => ({ __grant: arg })),
    notificationCreate: vi.fn((arg) => ({ __notification: arg })),
    userFindUnique: vi.fn(),
    achievementFindFirst: vi.fn(),
    transaction: vi.fn(async (ops) => ops),
  }));

vi.mock("@/lib/db", () => ({
  default: {
    makeupPointGrant: { aggregate, findMany: grantFindMany, create: grantCreate },
    notification: { create: notificationCreate },
    user: { findUnique: userFindUnique },
    achievement: { findFirst: achievementFindFirst },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/achievements/grace", () => ({
  perfectMonthGrace: vi.fn((domain: string | null) => (domain === "handon.club" ? 4 : 3)),
}));

import { grantMakeupPoints, resolveMakeupCap, resolveMakeupLimits } from "./ledger";

/** JST のその日の正午。 */
const jstNoon = (iso: string) => new Date(`${iso}T03:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  grantFindMany.mockResolvedValue([]);
  userFindUnique.mockResolvedValue({ createdAt: new Date("2026-01-01T00:00:00Z") });
  achievementFindFirst.mockResolvedValue(null);
});

describe("resolveMakeupCap - 月で上限の出所が切り替わる", () => {
  it("2026-09 以前は所属インスタンスの固定値（台帳は読まない）", async () => {
    await expect(resolveMakeupCap({ userId: "u1", instanceDomain: "handon.club", ym: "2026-09" })).resolves.toBe(4);
    await expect(resolveMakeupCap({ userId: "u1", instanceDomain: "other.example", ym: "2026-09" })).resolves.toBe(3);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("2026-10 以降はその月の付与合計（特典サーバーでも固定値は使わない）", async () => {
    aggregate.mockResolvedValue({ _sum: { amount: 5 } });

    await expect(resolveMakeupCap({ userId: "u1", instanceDomain: "handon.club", ym: "2026-10" })).resolves.toBe(5);
    expect(aggregate).toHaveBeenCalledWith({
      where: { userId: "u1", month: "2026-10" },
      _sum: { amount: true },
    });
  });

  it("台帳が空なら0（SUM が null を返す）", async () => {
    aggregate.mockResolvedValue({ _sum: { amount: null } });

    await expect(resolveMakeupCap({ userId: "u1", instanceDomain: null, ym: "2026-10" })).resolves.toBe(0);
  });
});

describe("resolveMakeupLimits - cap と『まだ来うる分』込みの上限", () => {
  it("従来ルールの月は cap と potentialCap が同じ固定値で、付与履歴は空", async () => {
    const r = await resolveMakeupLimits({
      userId: "u1",
      instanceDomain: "handon.club",
      ym: "2026-09",
      now: jstNoon("2026-09-20"),
    });

    expect(r).toEqual({ pointEra: false, cap: 4, potentialCap: 4, grants: [] });
  });

  it("当月の月初: 台帳が空でも、先月からいて先月皆勤でなければ catchup と実績の2pt を見込む", async () => {
    const r = await resolveMakeupLimits({
      userId: "u1",
      instanceDomain: null,
      ym: "2026-10",
      now: jstNoon("2026-10-05"),
    });

    expect(r.pointEra).toBe(true);
    expect(r.cap).toBe(0);
    expect(r.potentialCap).toBe(2);
  });

  it("先月皆勤賞を取っていれば catchup は見込まない", async () => {
    achievementFindFirst.mockResolvedValue({ id: "a1" });

    const r = await resolveMakeupLimits({
      userId: "u1",
      instanceDomain: null,
      ym: "2026-10",
      now: jstNoon("2026-10-05"),
    });

    expect(r.potentialCap).toBe(1);
    expect(achievementFindFirst).toHaveBeenCalledWith({
      where: { userId: "u1", key: "perfect-month:2026-09" },
      select: { id: true },
    });
  });

  it("今月登録したユーザーは catchup を見込まない（先月中にアカウントが無い）", async () => {
    userFindUnique.mockResolvedValue({ createdAt: jstNoon("2026-10-03") });

    const r = await resolveMakeupLimits({
      userId: "u1",
      instanceDomain: null,
      ym: "2026-10",
      now: jstNoon("2026-10-05"),
    });

    expect(r.potentialCap).toBe(1);
  });

  it("過去月は付与がもう来ないので potentialCap は cap と同じ（ユーザーや先月の実績を読まない）", async () => {
    grantFindMany.mockResolvedValue([{ reason: "favor-monthly", amount: 1, grantedAt: new Date() }]);

    const r = await resolveMakeupLimits({
      userId: "u1",
      instanceDomain: null,
      ym: "2026-10",
      now: jstNoon("2026-11-05"),
    });

    expect(r.cap).toBe(1);
    expect(r.potentialCap).toBe(1);
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("grantMakeupPoints - 冪等な付与と通知", () => {
  it("台帳行と付与通知を同じトランザクションで作る（通知だけ重複・欠落しない）", async () => {
    await expect(
      grantMakeupPoints({ userId: "u1", ym: "2026-10", reason: "signup", amount: 4 })
    ).resolves.toBe(true);

    expect(transaction).toHaveBeenCalledTimes(1);
    const ops = transaction.mock.calls[0][0] as unknown[];
    expect(ops).toEqual([
      { __grant: { data: { userId: "u1", month: "2026-10", reason: "signup", amount: 4 } } },
      {
        __notification: {
          data: {
            userId: "u1",
            type: "makeup-point",
            achievementKey: "perfect-month:2026-10",
            data: { reason: "signup", amount: 4 },
          },
        },
      },
    ]);
  });

  it("0pt は行も通知も作らない（「0pt獲得しました」を出さない）", async () => {
    await expect(
      grantMakeupPoints({ userId: "u1", ym: "2026-10", reason: "signup", amount: 0 })
    ).resolves.toBe(false);

    expect(transaction).not.toHaveBeenCalled();
  });

  it("同じ月×理由が既にあれば（一意制約違反）false を返して何もしない", async () => {
    transaction.mockRejectedValueOnce({ code: "P2002" });

    await expect(
      grantMakeupPoints({ userId: "u1", ym: "2026-10", reason: "favor-monthly", amount: 1 })
    ).resolves.toBe(false);
  });

  it("一意制約以外の失敗は投げる（握りつぶすと付与漏れに気づけない）", async () => {
    transaction.mockRejectedValueOnce(new Error("db down"));

    await expect(
      grantMakeupPoints({ userId: "u1", ym: "2026-10", reason: "favor-monthly", amount: 1 })
    ).rejects.toThrow("db down");
  });
});
