/**
 * イベント起点の穴埋めポイント付与（awards.ts）のテスト。
 *
 * 仕様（2026-10 以降）:
 * - 新規登録: 登録日で 0〜8pt（signup）。FAVOR_SERVERS 所属なら当月の favor-monthly(+1) も即時に付与
 *   （月途中の登録でも付与する方針。1日登録は signup 0pt だが favor-monthly は付く）
 * - 実績を1つでも達成: その月に1回だけ +1pt（achievement）
 * 2026-09 以前は何もしない。台帳の書き込み・通知はモックし、「何を付与しようとするか」を検証する。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { grantMakeupPoints, notifyMakeupReadyAfterGrant } = vi.hoisted(() => ({
  grantMakeupPoints: vi.fn(),
  notifyMakeupReadyAfterGrant: vi.fn(),
}));

vi.mock("./ledger", () => ({ grantMakeupPoints }));
vi.mock("./notify", () => ({ notifyMakeupReadyAfterGrant }));

import { grantSignupMakeupPoints, maybeGrantAchievementPoint } from "./awards";

/** JST で 2026-MM-DD の正午。 */
const jst = (month: number, day: number) => new Date(Date.UTC(2026, month - 1, day, 3, 0, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FAVOR_SERVERS", "handon.club");
  grantMakeupPoints.mockResolvedValue(true);
  notifyMakeupReadyAfterGrant.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("grantSignupMakeupPoints - 新規登録時", () => {
  it("5日に登録したら当月分の signup を4pt 付与する", async () => {
    await grantSignupMakeupPoints({ userId: "u1", instanceDomain: "other.example", now: jst(10, 5) });

    expect(grantMakeupPoints).toHaveBeenCalledTimes(1);
    expect(grantMakeupPoints).toHaveBeenCalledWith({
      userId: "u1",
      ym: "2026-10",
      reason: "signup",
      amount: 4,
    });
  });

  it("特典サーバー所属なら favor-monthly(+1) も同時に付与する（月途中の登録でも）", async () => {
    await grantSignupMakeupPoints({ userId: "u1", instanceDomain: "handon.club", now: jst(10, 20) });

    expect(grantMakeupPoints).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "signup", amount: 8 })
    );
    expect(grantMakeupPoints).toHaveBeenCalledWith({
      userId: "u1",
      ym: "2026-10",
      reason: "favor-monthly",
      amount: 1,
    });
  });

  it("特典サーバーは大文字小文字を区別しない", async () => {
    await grantSignupMakeupPoints({ userId: "u1", instanceDomain: "Handon.Club", now: jst(10, 20) });

    expect(grantMakeupPoints).toHaveBeenCalledWith(expect.objectContaining({ reason: "favor-monthly" }));
  });

  it("1日登録の特典サーバーユーザーも favor-monthly は付く（signup は 0pt を渡し、行は ledger 側で作らない）", async () => {
    await grantSignupMakeupPoints({ userId: "u1", instanceDomain: "handon.club", now: jst(10, 1) });

    expect(grantMakeupPoints).toHaveBeenCalledWith(expect.objectContaining({ reason: "signup", amount: 0 }));
    expect(grantMakeupPoints).toHaveBeenCalledWith(expect.objectContaining({ reason: "favor-monthly" }));
  });

  it("2026-09 以前の登録では何も付与しない", async () => {
    await grantSignupMakeupPoints({ userId: "u1", instanceDomain: "handon.club", now: jst(9, 20) });

    expect(grantMakeupPoints).not.toHaveBeenCalled();
  });
});

describe("maybeGrantAchievementPoint - 実績を達成したとき", () => {
  it("当月分の achievement を1pt 付与し、付与できたら『今すぐ穴埋め』を判定する", async () => {
    await maybeGrantAchievementPoint({ userId: "u1", now: jst(10, 15) });

    expect(grantMakeupPoints).toHaveBeenCalledWith({
      userId: "u1",
      ym: "2026-10",
      reason: "achievement",
      amount: 1,
    });
    expect(notifyMakeupReadyAfterGrant).toHaveBeenCalledWith({ userId: "u1", ym: "2026-10", now: jst(10, 15) });
  });

  it("その月に既に付与済み（2つ目以降の実績）なら促しの判定もしない", async () => {
    grantMakeupPoints.mockResolvedValue(false);

    await maybeGrantAchievementPoint({ userId: "u1", now: jst(10, 15) });

    expect(notifyMakeupReadyAfterGrant).not.toHaveBeenCalled();
  });

  it("2026-09 以前は何もしない", async () => {
    await maybeGrantAchievementPoint({ userId: "u1", now: jst(9, 30) });

    expect(grantMakeupPoints).not.toHaveBeenCalled();
  });
});
