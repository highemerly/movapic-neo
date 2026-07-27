import { describe, it, expect } from "vitest";
import {
  shouldSuggestInstall,
  afterDismiss,
  parseSuggestState,
  INITIAL_SUGGEST_STATE,
  type SuggestInput,
  type SuggestState,
} from "./suggest";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function input(overrides: Partial<SuggestInput> = {}): SuggestInput {
  return {
    platform: "android",
    standalone: false,
    canInstall: true,
    eligiblePost: true,
    state: INITIAL_SUGGEST_STATE,
    now: NOW,
    ...overrides,
  };
}

describe("shouldSuggestInstall", () => {
  it("Androidでインストール可能なら出す", () => {
    expect(shouldSuggestInstall(input())).toBe(true);
  });

  it("Androidでも beforeinstallprompt 未捕捉なら出さない", () => {
    expect(shouldSuggestInstall(input({ canInstall: false }))).toBe(false);
  });

  it("iOS Safariは捕捉できないので canInstall に関係なく出す", () => {
    expect(
      shouldSuggestInstall(input({ platform: "ios-safari", canInstall: false })),
    ).toBe(true);
  });

  it("デスクトップやiOS非Safari（other）には出さない", () => {
    expect(shouldSuggestInstall(input({ platform: "other" }))).toBe(false);
  });

  it("すでにPWAとして起動中なら出さない", () => {
    expect(shouldSuggestInstall(input({ standalone: true }))).toBe(false);
  });

  it("初投稿（サーバー側の前提を満たさない）なら出さない", () => {
    expect(shouldSuggestInstall(input({ eligiblePost: false }))).toBe(false);
  });

  it("猶予期間中は出さない", () => {
    const state: SuggestState = { dismissCount: 1, nextAt: NOW + 1, done: false };
    expect(shouldSuggestInstall(input({ state }))).toBe(false);
  });

  it("猶予が明けたら出す", () => {
    const state: SuggestState = { dismissCount: 1, nextAt: NOW, done: false };
    expect(shouldSuggestInstall(input({ state }))).toBe(true);
  });

  it("打ち止め後は猶予が明けても出さない", () => {
    const state: SuggestState = { dismissCount: 3, nextAt: 0, done: true };
    expect(shouldSuggestInstall(input({ state }))).toBe(false);
  });
});

describe("afterDismiss", () => {
  it("1回目は30日後まで出さない", () => {
    const next = afterDismiss(INITIAL_SUGGEST_STATE, NOW);
    expect(next).toEqual({ dismissCount: 1, nextAt: NOW + 30 * DAY, done: false });
  });

  it("2回目は90日後まで出さない", () => {
    const next = afterDismiss({ dismissCount: 1, nextAt: NOW, done: false }, NOW);
    expect(next).toEqual({ dismissCount: 2, nextAt: NOW + 90 * DAY, done: false });
  });

  it("3回目で打ち止めになる", () => {
    const next = afterDismiss({ dismissCount: 2, nextAt: NOW, done: false }, NOW);
    expect(next.done).toBe(true);
    expect(next.dismissCount).toBe(3);
  });
});

describe("parseSuggestState", () => {
  it("未保存なら初期値を返す", () => {
    expect(parseSuggestState(null)).toEqual(INITIAL_SUGGEST_STATE);
  });

  it("壊れたJSONでも初期値を返す", () => {
    expect(parseSuggestState("{oops")).toEqual(INITIAL_SUGGEST_STATE);
  });

  it("欠けたフィールドは初期値で補う", () => {
    expect(parseSuggestState(JSON.stringify({ nextAt: 123 }))).toEqual({
      dismissCount: 0,
      nextAt: 123,
      done: false,
    });
  });
});
