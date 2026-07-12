import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toJstDateString, calculateStreak } from "./streak";

// JST正午あたりの瞬間を作るヘルパ（UTC 03:00 = JST 12:00）。
// これで「JST日付 = 引数の日」になり、UTC/JSTのズレに埋もれないテストデータを作れる。
const jstNoon = (isoDay: string) => new Date(`${isoDay}T03:00:00Z`);

describe("toJstDateString", () => {
  it("UTC+9してYYYY-MM-DDを返す", () => {
    expect(toJstDateString(new Date("2024-01-15T00:00:00Z"))).toBe("2024-01-15");
    expect(toJstDateString(new Date("2024-01-15T03:00:00Z"))).toBe("2024-01-15");
  });

  it("JSTの日付境界（UTC 15:00）で日が繰り上がる", () => {
    // JST 00:00 ちょうど = 前日 UTC 15:00
    expect(toJstDateString(new Date("2024-01-14T15:00:00Z"))).toBe("2024-01-15");
    // その1ミリ秒前はまだ前日
    expect(toJstDateString(new Date("2024-01-14T14:59:59.999Z"))).toBe("2024-01-14");
  });

  it("UTCでは前月でもJSTでは翌月になるケース（月跨ぎバグの回帰）", () => {
    // 2024-03-31 20:00 UTC = 2024-04-01 05:00 JST
    expect(toJstDateString(new Date("2024-03-31T20:00:00Z"))).toBe("2024-04-01");
  });

  it("年跨ぎ", () => {
    // 2023-12-31 15:00 UTC = 2024-01-01 00:00 JST
    expect(toJstDateString(new Date("2023-12-31T15:00:00Z"))).toBe("2024-01-01");
  });
});

describe("calculateStreak", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // 「今日」を JST 2024-01-15 に固定（UTC 03:00 = JST 12:00）
  const freezeAt = (iso: string) => vi.setSystemTime(new Date(iso));

  it("投稿が無ければ0", () => {
    freezeAt("2024-01-15T03:00:00Z");
    expect(calculateStreak([])).toBe(0);
  });

  it("今日だけ投稿があれば1", () => {
    freezeAt("2024-01-15T03:00:00Z");
    expect(calculateStreak([jstNoon("2024-01-15")])).toBe(1);
  });

  it("今日から連続していれば日数を数える", () => {
    freezeAt("2024-01-15T03:00:00Z");
    const dates = [jstNoon("2024-01-15"), jstNoon("2024-01-14"), jstNoon("2024-01-13")];
    expect(calculateStreak(dates)).toBe(3);
  });

  it("今日は未投稿でも昨日があればそこから数える", () => {
    freezeAt("2024-01-15T03:00:00Z");
    const dates = [jstNoon("2024-01-14"), jstNoon("2024-01-13")];
    expect(calculateStreak(dates)).toBe(2);
  });

  it("今日も昨日も無ければ0（連続が途切れている）", () => {
    freezeAt("2024-01-15T03:00:00Z");
    expect(calculateStreak([jstNoon("2024-01-13")])).toBe(0);
  });

  it("途中に欠けがあればそこで打ち切る", () => {
    freezeAt("2024-01-15T03:00:00Z");
    // 15,14 は連続、13 が欠け、12 があっても数えない
    const dates = [jstNoon("2024-01-15"), jstNoon("2024-01-14"), jstNoon("2024-01-12")];
    expect(calculateStreak(dates)).toBe(2);
  });

  it("同一日の重複はまとめて1日として数える", () => {
    freezeAt("2024-01-15T03:00:00Z");
    const dates = [jstNoon("2024-01-15"), jstNoon("2024-01-15"), jstNoon("2024-01-14")];
    expect(calculateStreak(dates)).toBe(2);
  });

  it("未来日の投稿は現在の連続数を水増ししない", () => {
    freezeAt("2024-01-15T03:00:00Z");
    const dates = [jstNoon("2024-01-16"), jstNoon("2024-01-15"), jstNoon("2024-01-14")];
    expect(calculateStreak(dates)).toBe(2);
  });

  it("入力順に依存しない", () => {
    freezeAt("2024-01-15T03:00:00Z");
    const dates = [jstNoon("2024-01-13"), jstNoon("2024-01-15"), jstNoon("2024-01-14")];
    expect(calculateStreak(dates)).toBe(3);
  });

  it("「今日」はJSTで判定する（UTC深夜=JST翌日のズレを吸収）", () => {
    // 2024-01-15 15:30 UTC = 2024-01-16 00:30 JST → 今日は JST 1/16
    freezeAt("2024-01-15T15:30:00Z");
    // JST 1/16 の投稿を「今日」として拾えれば1。UTC判定だと0になり落ちる。
    expect(calculateStreak([jstNoon("2024-01-16")])).toBe(1);
  });
});
