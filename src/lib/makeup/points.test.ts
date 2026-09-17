/**
 * 穴埋めポイント制の純粋ロジックのテスト。
 *
 * ここはポイント制の「しきい値・付与量・締切・上限」の単一ソース。付与（定期ジョブ・登録時・
 * 実績時）、割当の可否（PATCH）、カレンダー表示、通知ゲートのすべてがここを通るため、
 * ここが正しければ「付与した量」「埋められる量」「締切」が経路ごとに食い違わない。
 *
 * 締切は「翌月10日 23:59:59.999 JST まで」。UTC で書くと日付がずれるので、境界は必ず
 * JST 00:00 = UTC 前日15:00 の形で検証する。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  MAKEUP_POINT_REASONS,
  MAKEUP_POINT_START_YM,
  MONTHLY_CATCHUP_DAY,
  makeupPointStartYm,
  SIGNUP_POINT_MAX,
  hasGrant,
  isCatchupOpen,
  isMakeupEditable,
  isPointEra,
  makeupDeadline,
  potentialCapOf,
  remainingPoints,
  signupPointAmount,
  sumGrants,
} from "./points";

const { FAVOR_MONTHLY, MONTHLY_CATCHUP, SIGNUP, ACHIEVEMENT } = MAKEUP_POINT_REASONS;

describe("isPointEra - 2026-10 からポイント制", () => {
  it("2026-09 以前は従来ルール", () => {
    expect(isPointEra("2026-09")).toBe(false);
    expect(isPointEra("2025-12")).toBe(false);
  });

  it("2026-10 以降はポイント制", () => {
    expect(isPointEra(MAKEUP_POINT_START_YM)).toBe(true);
    expect(isPointEra("2026-10")).toBe(true);
    expect(isPointEra("2027-01")).toBe(true);
  });
});

describe("makeupPointStartYm - 開発時だけ開始月を前倒しできる", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("上書きが無ければ 2026-10", () => {
    vi.stubEnv("NEXT_PUBLIC_MAKEUP_POINT_START_YM", "");
    expect(makeupPointStartYm()).toBe("2026-10");
  });

  it("開発時は env で前倒しでき、isPointEra にも効く", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_MAKEUP_POINT_START_YM", "2026-09");
    expect(makeupPointStartYm()).toBe("2026-09");
    expect(isPointEra("2026-09")).toBe(true);
    expect(isPointEra("2026-08")).toBe(false);
  });

  it("本番では上書きを無視する（切り替え月が動くと確定済みの月の上限が変わる）", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_MAKEUP_POINT_START_YM", "2026-09");
    expect(makeupPointStartYm()).toBe("2026-10");
    expect(isPointEra("2026-09")).toBe(false);
  });

  it("形式が不正な値は無視する", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_MAKEUP_POINT_START_YM", "2026-9");
    expect(makeupPointStartYm()).toBe("2026-10");
  });
});

describe("signupPointAmount - 登録日で配る量が決まる", () => {
  it("1日登録は0pt（まだ過ぎた日が無い）", () => {
    expect(signupPointAmount(1)).toBe(0);
  });

  it("2日登録は+1pt、4日登録は+3pt（過ぎた日数ぶん）", () => {
    expect(signupPointAmount(2)).toBe(1);
    expect(signupPointAmount(4)).toBe(3);
  });

  it("9日登録で上限の+8pt", () => {
    expect(signupPointAmount(9)).toBe(8);
    expect(SIGNUP_POINT_MAX).toBe(8);
  });

  it("10日以降は+8ptで固定", () => {
    expect(signupPointAmount(10)).toBe(8);
    expect(signupPointAmount(20)).toBe(8);
    expect(signupPointAmount(31)).toBe(8);
  });
});

describe("makeupDeadline - 翌月10日 23:59 JST まで", () => {
  it("10月分の締切は 11/11 JST 00:00（排他上限）", () => {
    // 11/11 00:00 JST = 11/10 15:00 UTC
    expect(makeupDeadline("2026-10").toISOString()).toBe("2026-11-10T15:00:00.000Z");
  });

  it("12月分は翌年1月11日", () => {
    expect(makeupDeadline("2026-12").toISOString()).toBe("2027-01-10T15:00:00.000Z");
  });

  it("従来ルールの月（2026-09）にも同じ締切を適用する", () => {
    expect(makeupDeadline("2026-09").toISOString()).toBe("2026-10-10T15:00:00.000Z");
  });
});

describe("isMakeupEditable - 締切と未来月", () => {
  it("当月は編集できる", () => {
    expect(isMakeupEditable("2026-10", new Date("2026-10-05T03:00:00Z"))).toBe(true);
  });

  it("翌月10日 23:59:59.999 JST まではまだ先月を編集できる", () => {
    // 11/10 23:59:59.999 JST = 11/10 14:59:59.999 UTC
    expect(isMakeupEditable("2026-10", new Date("2026-11-10T14:59:59.999Z"))).toBe(true);
  });

  it("翌月11日 00:00 JST ちょうどで締め切る", () => {
    expect(isMakeupEditable("2026-10", new Date("2026-11-10T15:00:00.000Z"))).toBe(false);
  });

  it("2ヶ月前の月は編集できない", () => {
    expect(isMakeupEditable("2026-09", new Date("2026-11-05T03:00:00Z"))).toBe(false);
  });

  it("未来月は編集できない", () => {
    expect(isMakeupEditable("2026-11", new Date("2026-10-31T03:00:00Z"))).toBe(false);
  });

  it("月の変わり目は JST で判定する（UTC ではまだ前月でも JST で翌月なら当月扱い）", () => {
    // 2026-10-31T15:00Z = 11/1 00:00 JST → 11月は当月
    expect(isMakeupEditable("2026-11", new Date("2026-10-31T15:00:00Z"))).toBe(true);
  });
});

describe("isCatchupOpen - monthly-catchup は締切の翌日（11日）以降", () => {
  it("10日 23:59 JST はまだ付与しない（先月をまだ埋められる）", () => {
    // 10/10 23:59 JST = 10/10 14:59 UTC
    expect(isCatchupOpen(new Date("2026-10-10T14:59:59Z"))).toBe(false);
    expect(MONTHLY_CATCHUP_DAY).toBe(11);
  });

  it("11日 00:00 JST から付与する", () => {
    expect(isCatchupOpen(new Date("2026-10-10T15:00:00Z"))).toBe(true);
  });

  it("11日を過ぎても付与対象のまま（ジョブ停止で11日を跨いでも次の実行で拾う）", () => {
    expect(isCatchupOpen(new Date("2026-10-20T03:00:00Z"))).toBe(true);
  });
});

describe("sumGrants / hasGrant / remainingPoints - 台帳から cap と残高を出す", () => {
  it("台帳が空なら cap は0", () => {
    expect(sumGrants([])).toBe(0);
  });

  it("amount の合計が cap（登録時の複数pt も1行で表す）", () => {
    const grants = [
      { reason: SIGNUP, amount: 4 },
      { reason: FAVOR_MONTHLY, amount: 1 },
      { reason: ACHIEVEMENT, amount: 1 },
    ];
    expect(sumGrants(grants)).toBe(6);
  });

  it("理由の有無を判定する", () => {
    const grants = [{ reason: FAVOR_MONTHLY, amount: 1 }];
    expect(hasGrant(grants, FAVOR_MONTHLY)).toBe(true);
    expect(hasGrant(grants, MONTHLY_CATCHUP)).toBe(false);
  });

  it("残高は cap − 埋めた数", () => {
    expect(remainingPoints(3, 1)).toBe(2);
    expect(remainingPoints(1, 1)).toBe(0);
  });

  it("残高は負にならない（従来ルール月から持ち越した超過割当があっても0で止める）", () => {
    expect(remainingPoints(0, 2)).toBe(0);
  });
});

describe("potentialCapOf - 達成可能性の判定に使う『まだ来うる分』込みの上限", () => {
  it("月初で台帳が空でも、catchup 対象なら catchup と実績の2pt ぶん見込める", () => {
    // これが無いと月初10日間の cap=0 ユーザーは1日休んだ瞬間に「達成不可」扱いになり、
    // コールアウトも通知も消える
    expect(potentialCapOf({ grants: [], isCurrentMonth: true, catchupEligible: true })).toBe(2);
  });

  it("catchup 対象外（先月皆勤・今月登録）なら実績の1pt だけ見込む", () => {
    expect(potentialCapOf({ grants: [], isCurrentMonth: true, catchupEligible: false })).toBe(1);
  });

  it("既に付与済みの理由は二重に見込まない", () => {
    const grants = [
      { reason: MONTHLY_CATCHUP, amount: 1 },
      { reason: ACHIEVEMENT, amount: 1 },
    ];
    expect(potentialCapOf({ grants, isCurrentMonth: true, catchupEligible: true })).toBe(2);
  });

  it("他の理由の付与は cap に足したうえで未付与分を見込む", () => {
    const grants = [{ reason: SIGNUP, amount: 5 }];
    // 今月登録なので catchup は来ない。実績の1pt だけ見込む
    expect(potentialCapOf({ grants, isCurrentMonth: true, catchupEligible: false })).toBe(6);
  });

  it("過去月はもう付与が来ないので cap そのもの", () => {
    const grants = [{ reason: FAVOR_MONTHLY, amount: 1 }];
    expect(potentialCapOf({ grants, isCurrentMonth: false, catchupEligible: true })).toBe(1);
  });
});
