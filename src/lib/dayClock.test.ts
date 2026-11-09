import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  addDays,
  applyBoundaryChange,
  asPostDate,
  BOUNDARY_CHANGE_MARGIN_MS,
  daysBetween,
  dayRangeLabel,
  dayStart,
  describeBoundarySchedule,
  hourOn,
  isPostDate,
  isValidBoundaryHour,
  jstCalendarDateOf,
  LATEST_CLOCK,
  planBoundaryChange,
  postDateOf,
  uniformSchedule,
  upcomingChanges,
  type BoundaryEntry,
  type BoundarySchedule,
  type PostDate,
} from "./dayClock";

const d = (s: string) => asPostDate(s);
/** JST の壁時計の時刻 "YYYY-MM-DDTHH:mm" を Date にする。 */
const jst = (s: string) => new Date(`${s}:00+09:00`);
const entry = (fromDate: string, hour: number): BoundaryEntry => ({ fromDate: d(fromDate), hour });

// ローカル時刻のメソッドを使っていないことを、UTC でも JST でもない TZ で確かめる。
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe("日付の基本演算", () => {
  it("addDays は月末・年末・うるう年をまたぐ", () => {
    expect(addDays(d("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2026-03-01"), -1)).toBe("2026-02-28");
  });

  it("daysBetween は b − a の日数", () => {
    expect(daysBetween(d("2026-10-01"), d("2026-11-01"))).toBe(31);
    expect(daysBetween(d("2026-11-01"), d("2026-10-31"))).toBe(-1);
  });

  it("isPostDate は実在しない日付を弾く", () => {
    expect(isPostDate("2026-02-29")).toBe(false);
    expect(isPostDate("2026-2-1")).toBe(false);
    expect(isPostDate("2028-02-29")).toBe(true);
  });

  it("isValidBoundaryHour は 0〜4 の整数だけ", () => {
    expect([0, 1, 2, 3, 4].every(isValidBoundaryHour)).toBe(true);
    expect([-1, 5, 2.5, "2", null].some(isValidBoundaryHour)).toBe(false);
  });

  it("jstCalendarDateOf は JST の暦日", () => {
    expect(jstCalendarDateOf(jst("2026-11-01T00:00"))).toBe("2026-11-01");
    expect(jstCalendarDateOf(new Date(jst("2026-11-01T00:00").getTime() - 1))).toBe("2026-10-31");
  });
});

describe("postDateOf", () => {
  it("行が無ければ 0 時区切り（従来の JST と同じ）", () => {
    expect(postDateOf([], jst("2026-11-09T00:00"))).toBe("2026-11-09");
    expect(postDateOf([], jst("2026-11-08T23:59"))).toBe("2026-11-08");
  });

  it("2 時区切りなら 1:59 までは前の日、2:00 から当日", () => {
    const s = uniformSchedule(2);
    expect(postDateOf(s, jst("2026-11-09T01:59"))).toBe("2026-11-08");
    expect(postDateOf(s, jst("2026-11-09T02:00"))).toBe("2026-11-09");
  });

  it("月またぎ・年またぎでも前の日になる", () => {
    const s = uniformSchedule(4);
    expect(postDateOf(s, jst("2026-11-01T03:30"))).toBe("2026-10-31");
    expect(postDateOf(s, jst("2027-01-01T01:00"))).toBe("2026-12-31");
  });

  it("切り替えた日は長さが変わる（0→2 は 26 時間・2→0 は 22 時間）", () => {
    const up: BoundarySchedule = [entry("2026-11-10", 2)];
    expect(postDateOf(up, jst("2026-11-10T01:00"))).toBe("2026-11-09");
    expect(dayStart(up, d("2026-11-10")).getTime() - dayStart(up, d("2026-11-09")).getTime()).toBe(
      26 * 3600_000
    );
    const down: BoundarySchedule = [entry("2026-11-01", 2), entry("2026-11-10", 0)];
    expect(postDateOf(down, jst("2026-11-10T00:30"))).toBe("2026-11-10");
    expect(dayStart(down, d("2026-11-10")).getTime() - dayStart(down, d("2026-11-09")).getTime()).toBe(
      22 * 3600_000
    );
  });

  it("LATEST_CLOCK は 4 時区切り", () => {
    expect(postDateOf(LATEST_CLOCK, jst("2026-11-11T03:59"))).toBe("2026-11-10");
    expect(postDateOf(LATEST_CLOCK, jst("2026-11-11T04:00"))).toBe("2026-11-11");
  });
});

describe("planBoundaryChange", () => {
  it("ふつうは明日から", () => {
    const plan = planBoundaryChange([], 2, jst("2026-11-08T15:00"));
    expect(plan).toEqual({ deleteFrom: "2026-11-09", insert: entry("2026-11-09", 2) });
  });

  it("2時区切りの人が 1:00（まだ前日）に 0 時へ変えると明後日から（0:00 の境界は過ぎている）", () => {
    const s: BoundarySchedule = [entry("2026-11-01", 2)];
    const plan = planBoundaryChange(s, 0, jst("2026-11-09T01:00"));
    expect(plan.insert).toEqual(entry("2026-11-10", 0));
  });

  it("0時区切りの人が 1:00 に 4 時へ変えても、昨日の分にはできない（明後日から）", () => {
    const now = jst("2026-11-09T01:00");
    const plan = planBoundaryChange([], 4, now);
    expect(plan.insert).toEqual(entry("2026-11-10", 4));
    const after = applyBoundaryChange([], plan);
    expect(postDateOf(after, now)).toBe("2026-11-09");
    expect(postDateOf(after, jst("2026-11-09T03:00"))).toBe("2026-11-09");
  });

  it("23:55 の変更は余白（10分）のため明後日から", () => {
    const plan = planBoundaryChange([], 2, jst("2026-11-08T23:55"));
    expect(plan.insert).toEqual(entry("2026-11-10", 2));
  });

  it("予約の取り消しで今日より後の行が2つになることがある", () => {
    // 11/8 に 0→4 時を予約 → 11/9 は 4:00 始まり
    const booked = applyBoundaryChange([], planBoundaryChange([], 4, jst("2026-11-08T15:00")));
    expect(booked).toEqual([entry("2026-11-09", 4)]);
    // 11/9 2:00（まだ 11/8）に 0 時へ取り消し → 11/9 0:00 は過ぎているので 11/10 から
    const now = jst("2026-11-09T02:00");
    const after = applyBoundaryChange(booked, planBoundaryChange(booked, 0, now));
    expect(after).toEqual([entry("2026-11-09", 4), entry("2026-11-10", 0)]);
    expect(upcomingChanges(after, now)).toEqual([entry("2026-11-09", 4), entry("2026-11-10", 0)]);
  });

  it("予約を同じ日のうちに上書きすると行が置き換わる", () => {
    const booked = applyBoundaryChange([], planBoundaryChange([], 4, jst("2026-11-08T10:00")));
    const after = applyBoundaryChange(booked, planBoundaryChange(booked, 2, jst("2026-11-08T12:00")));
    expect(after).toEqual([entry("2026-11-09", 2)]);
  });

  it("今と同じ区切りへの変更は行を足さない（予約の取り消しは行が消える）", () => {
    const booked = applyBoundaryChange([], planBoundaryChange([], 3, jst("2026-11-08T10:00")));
    const plan = planBoundaryChange(booked, 0, jst("2026-11-08T12:00"));
    expect(plan.insert).toBeNull();
    expect(applyBoundaryChange(booked, plan)).toEqual([]);
  });

  it("hourOn は fromDate 以前の最新の行", () => {
    const s: BoundarySchedule = [entry("2026-11-10", 0), entry("2026-11-01", 2)];
    expect(hourOn(s, d("2026-10-31"))).toBe(0);
    expect(hourOn(s, d("2026-11-05"))).toBe(2);
    expect(hourOn(s, d("2026-11-10"))).toBe(0);
  });
});

describe("表示用の文言", () => {
  it("dayRangeLabel は 1日の範囲", () => {
    expect(dayRangeLabel(0)).toBe("0:00〜23:59");
    expect(dayRangeLabel(2)).toBe("2:00〜翌1:59");
  });

  it("describeBoundarySchedule は予約を日付つきで出す（今日から効いているように見せない）", () => {
    expect(describeBoundarySchedule(0, [])).toBe("0時区切りのままです");
    expect(describeBoundarySchedule(0, [entry("2026-11-10", 2)])).toBe(
      "11/10から2時区切りになります（今日は0時区切りのままです）"
    );
    expect(describeBoundarySchedule(2, [entry("2026-11-09", 4), entry("2026-11-10", 0)])).toBe(
      "11/9は4時区切り、11/10から0時区切りになります（今日は2時区切りのままです）"
    );
  });
});

/** 再現できる乱数（依存を増やさないため自前）。 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("性質（ランダムな履歴・時刻・区切り）", () => {
  const rand = mulberry32(20261109);
  const base = jst("2026-10-25T00:00").getTime();
  const randHour = () => Math.floor(rand() * 5);

  /** 実際の操作と同じく、変更を時系列で積み重ねて履歴を作る。 */
  function randomHistory(): { schedule: BoundaryEntry[]; now: Date } {
    let schedule: BoundaryEntry[] = [];
    let t = base;
    const steps = Math.floor(rand() * 6);
    for (let i = 0; i < steps; i++) {
      t += Math.floor(rand() * 3 * 86400_000);
      schedule = applyBoundaryChange(schedule, planBoundaryChange(schedule, randHour(), new Date(t)));
    }
    return { schedule, now: new Date(t + Math.floor(rand() * 86400_000)) };
  }

  // 1回ごとに expect を呼ぶと全体実行の負荷で数秒かかり、タイムアウトしうる。違反を集めて最後に確かめる。

  it("変更は now+余白 までの時刻の記録日を変えない", () => {
    const violations: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const { schedule, now } = randomHistory();
      const after = applyBoundaryChange(schedule, planBoundaryChange(schedule, randHour(), now));
      for (let k = 0; k < 20; k++) {
        const t = new Date(now.getTime() + BOUNDARY_CHANGE_MARGIN_MS - Math.floor(rand() * 20 * 86400_000));
        if (postDateOf(after, t) !== postDateOf(schedule, t)) violations.push(t.toISOString());
      }
    }
    expect(violations).toEqual([]);
  });

  it("記録日は時刻に対して単調で、JST の暦日かその前日", () => {
    const violations: string[] = [];
    for (let i = 0; i < 500; i++) {
      const { schedule } = randomHistory();
      let prev: PostDate | null = null;
      let t = base;
      for (let k = 0; k < 200; k++) {
        t += Math.floor(rand() * 6 * 3600_000);
        const pd = postDateOf(schedule, new Date(t));
        const cal = jstCalendarDateOf(new Date(t));
        if (pd !== cal && pd !== addDays(cal, -1)) violations.push(`range ${new Date(t).toISOString()}`);
        if (prev != null && pd < prev) violations.push(`order ${new Date(t).toISOString()}`);
        prev = pd;
      }
    }
    expect(violations).toEqual([]);
  });

  it("今日より後の行は最大2つ", () => {
    let max = 0;
    for (let i = 0; i < 2000; i++) {
      const { schedule, now } = randomHistory();
      const after = applyBoundaryChange(schedule, planBoundaryChange(schedule, randHour(), now));
      max = Math.max(max, upcomingChanges(after, now).length);
    }
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe("回帰防止: 生 SQL で JST の日付を計算し直さない", () => {
  // ESLint（eslint.config.mjs の DAY_SEMANTIC_FILES）は import しか見られないので、SQL はここで見る。
  // 日・月を数える SQL は post_date を使う。時計どおりの暦で数える管理画面（src/lib/admin）だけが例外。
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("AT TIME ZONE は src/lib/admin の外に出てこない", () => {
    const root = join(__dirname, "..", "..");
    const offenders = [...sourceFiles(join(root, "src")), ...sourceFiles(join(root, "scripts"))]
      .map((p) => relative(root, p))
      .filter((p) => !p.startsWith(join("src", "lib", "admin")))
      .filter((p) => /AT TIME ZONE/i.test(readFileSync(join(root, p), "utf8")));
    expect(offenders).toEqual([]);
  });
});
