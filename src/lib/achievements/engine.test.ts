import { describe, it, expect } from "vitest";
import {
  selectNewlyGranted,
  selectNewlyGrantedProfile,
  selectNewlyGrantedReaction,
} from "./engine";
import {
  PERFECT_MONTH_CATEGORY,
  SEASON_CATEGORY,
  type AchStats,
  type PostFacts,
  type ReactionStats,
} from "./catalog";
import {
  DEFAULT_POSITION,
  DEFAULT_FONT,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_ARRANGEMENT,
} from "@/types";

// 何も追加で獲得しない中立の集計値（totalPosts=1 なので first-post だけが立つ）。
function stats(overrides: Partial<AchStats> = {}): AchStats {
  return {
    totalPosts: 1,
    currentStreak: 1,
    todayPosts: 1,
    distinctDaysInPostMonth: 1,
    postMonthDayCounts: { 15: 1 },
    filledHoleDays: [],
    distinctPostMonths: 1,
    distinctPostHours: 1,
    featureCounts: { neon: 0, stamp: 0, xlarge: 0, vertical: 0 },
    distinctFonts: 1,
    distinctColors: 1,
    distinctCameraModels: 0,
    distinctPrefectures: 0,
    hasEmailPost: false,
    hasMentionPost: false,
    distinctSourcesToday: 1,
    ...overrides,
  };
}

// 全オプション既定・JST 12:00・6/15（早朝/深夜/元日いずれにも当たらない）の中立投稿。
function post(overrides: Partial<PostFacts> = {}): PostFacts {
  return {
    overlayText: "hello",
    position: DEFAULT_POSITION,
    font: DEFAULT_FONT,
    color: DEFAULT_COLOR,
    size: DEFAULT_SIZE,
    arrangement: DEFAULT_ARRANGEMENT,
    season: null,
    source: "web",
    cameraModel: null,
    locationPrefecture: null,
    visibility: "public",
    createdAt: new Date("2026-06-15T03:00:00Z"),
    ...overrides,
  };
}

const GRACE = 3;
const keysOf = (s: AchStats, p: PostFacts, owned: Set<string> = new Set()) =>
  selectNewlyGranted(s, p, owned, GRACE).map((c) => c.key);

describe("selectNewlyGranted: 基本挙動", () => {
  it("初投稿（中立）は first-post のみ", () => {
    expect(keysOf(stats(), post())).toEqual(["first-post"]);
  });

  it("取得済みキーは除外する", () => {
    expect(keysOf(stats(), post(), new Set(["first-post"]))).toEqual([]);
  });
});

describe("selectNewlyGranted: しきい値は >= で到達時に付与", () => {
  it("累計50投稿で 5/10/20/30/50 が立ち、100は立たない", () => {
    const got = keysOf(stats({ totalPosts: 50 }), post());
    const posts = got.filter((k) => k.startsWith("posts:"));
    expect(posts).toEqual(["posts:5", "posts:10", "posts:20", "posts:30", "posts:50"]);
    expect(got).not.toContain("posts:100");
  });

  it("到達直前（49）では上の段は立たない", () => {
    const got = keysOf(stats({ totalPosts: 49 }), post());
    expect(got).toContain("posts:30");
    expect(got).not.toContain("posts:50");
  });

  it("連続投稿は境界ちょうどで立つ（2で streak:2、1では立たない）", () => {
    expect(keysOf(stats({ currentStreak: 2 }), post())).toContain("streak:2");
    expect(keysOf(stats({ currentStreak: 1 }), post())).not.toContain("streak:2");
  });

  it("投稿した月数は到達した段まで立つ（連続でなくてよい）", () => {
    const got = keysOf(stats({ distinctPostMonths: 12 }), post());
    expect(got.filter((k) => k.startsWith("months:"))).toEqual(["months:6", "months:12"]);
    expect(keysOf(stats({ distinctPostMonths: 5 }), post())).not.toContain("months:6");
  });

  it("機能利用（縦書きは tier1 から、ネオンは5から）", () => {
    expect(keysOf(stats({ featureCounts: { neon: 0, stamp: 0, xlarge: 0, vertical: 1 } }), post())).toContain(
      "feature:vertical:1"
    );
    expect(keysOf(stats({ featureCounts: { neon: 5, stamp: 0, xlarge: 0, vertical: 0 } }), post())).toContain(
      "feature:neon:5"
    );
  });
});

describe("selectNewlyGranted: 単発・シークレット述語", () => {
  it("130文字以上で long-text（グラフェム数）", () => {
    expect(keysOf(stats(), post({ overlayText: "あ".repeat(130) }))).toContain("long-text");
    expect(keysOf(stats(), post({ overlayText: "あ".repeat(129) }))).not.toContain("long-text");
  });

  it("1文字ちょうどで one-char（絵文字1個も1文字）", () => {
    expect(keysOf(stats(), post({ overlayText: "あ" }))).toContain("one-char");
    expect(keysOf(stats(), post({ overlayText: "😀" }))).toContain("one-char");
    expect(keysOf(stats(), post({ overlayText: "ab" }))).not.toContain("one-char");
  });

  it("既定以外の装飾で custom-options（season投稿は対象外）", () => {
    expect(keysOf(stats(), post({ color: "red" }))).toContain("custom-options");
    // season 投稿はスタイルがプリセットなので対象外
    expect(keysOf(stats(), post({ color: "red", season: "tanabata" }))).not.toContain("custom-options");
  });

  it("local 投稿で local-only、元日で new-year-writing、早朝で early-bird", () => {
    expect(keysOf(stats(), post({ visibility: "local" }))).toContain("local-only");
    expect(keysOf(stats(), post({ createdAt: new Date("2026-01-01T03:00:00Z") }))).toContain(
      "new-year-writing"
    );
    // JST 6時 = UTC 21時（前日）
    expect(keysOf(stats(), post({ createdAt: new Date("2026-06-14T21:00:00Z") }))).toContain("early-bird");
  });

  it("24時間すべてに投稿していれば all-hours（23時間では立たない）", () => {
    expect(keysOf(stats({ distinctPostHours: 24 }), post())).toContain("all-hours");
    expect(keysOf(stats({ distinctPostHours: 23 }), post())).not.toContain("all-hours");
  });

  it("early-adopter は投稿では絶対に付与されない（evaluate=false）", () => {
    expect(keysOf(stats({ totalPosts: 999 }), post())).not.toContain("early-adopter");
  });
});

describe("selectNewlyGranted: 動的キー（皆勤賞・シーズン）", () => {
  it("皆勤月は perfect-month:YYYY-MM を付与する", () => {
    // 2026年6月（30日）を全日投稿
    const dayCounts: Record<number, number> = {};
    for (let d = 1; d <= 30; d++) dayCounts[d] = 1;
    const cands = selectNewlyGranted(
      stats({ postMonthDayCounts: dayCounts, distinctDaysInPostMonth: 30 }),
      post(),
      new Set(),
      GRACE
    );
    const pm = cands.find((c) => c.key === "perfect-month:2026-06");
    expect(pm?.category).toBe(PERFECT_MONTH_CATEGORY);
  });

  it("season 投稿は season:<key> を付与し、取得済みなら重複しない", () => {
    const cands = selectNewlyGranted(stats(), post({ season: "tanabata" }), new Set(), GRACE);
    const s = cands.find((c) => c.key === "season:tanabata");
    expect(s?.category).toBe(SEASON_CATEGORY);
    // 取得済みなら出ない
    expect(keysOf(stats(), post({ season: "tanabata" }), new Set(["season:tanabata"]))).not.toContain(
      "season:tanabata"
    );
  });
});

// --- リアクション起点（押した瞬間・受け取った瞬間にしか確定しない実績） ---
function rstats(overrides: Partial<ReactionStats> = {}): ReactionStats {
  return { given: 0, givenCustomEmoji: 0, givenDistinctOwners: 0, received: 0, ...overrides };
}
const reactionKeysOf = (s: ReactionStats, owned: Set<string> = new Set()) =>
  selectNewlyGrantedReaction(s, owned).map((c) => c.key);

describe("selectNewlyGrantedReaction: リアクション起点の実績", () => {
  it("1件目のリアクションで first-reaction が立つ（0件では立たない）", () => {
    expect(reactionKeysOf(rstats())).toEqual([]);
    expect(reactionKeysOf(rstats({ given: 1 }))).toEqual(["first-reaction"]);
  });

  it("カスタム絵文字リアクションはしきい値到達で段が立つ（Unicodeのみでは立たない）", () => {
    expect(reactionKeysOf(rstats({ given: 30 }))).toEqual(["first-reaction"]);
    expect(reactionKeysOf(rstats({ given: 30, givenCustomEmoji: 30 }))).toEqual([
      "reaction:custom:5",
      "reaction:custom:30",
      "first-reaction",
    ]);
    expect(reactionKeysOf(rstats({ given: 4, givenCustomEmoji: 4 }))).toEqual(["first-reaction"]);
  });

  it("獲得したリアクション総数は到達した段まで立ち、取得済みは除外する", () => {
    expect(reactionKeysOf(rstats({ received: 50 }))).toEqual([
      "reaction:received:10",
      "reaction:received:50",
    ]);
    expect(reactionKeysOf(rstats({ received: 50 }), new Set(["reaction:received:10"]))).toEqual([
      "reaction:received:50",
    ]);
  });

  it("応援した人数は件数ではなく人数で立つ（大量に押しても人数が足りなければ立たない）", () => {
    expect(reactionKeysOf(rstats({ given: 100, givenDistinctOwners: 20 }))).toEqual([
      "reaction:users:10",
      "reaction:users:20",
      "first-reaction",
    ]);
    expect(reactionKeysOf(rstats({ given: 100, givenDistinctOwners: 9 }))).toEqual([
      "first-reaction",
    ]);
  });

  it("投稿起点の実績は混ざらない（評価タイミングが違う）", () => {
    const keys = reactionKeysOf(rstats({ given: 100, givenCustomEmoji: 100, received: 1000 }));
    expect(keys).not.toContain("first-post");
    expect(keys.every((k) => k.startsWith("reaction:") || k === "first-reaction")).toBe(true);
  });

  it("リアクション起点の実績は投稿の評価では絶対に立たない", () => {
    const keys = keysOf(stats({ totalPosts: 500 }), post());
    expect(keys).not.toContain("first-reaction");
    expect(keys.some((k) => k.startsWith("reaction:"))).toBe(false);
  });
});

// --- プロフィール起点（自己紹介を保存した瞬間にしか確定しない実績） ---
const profileKeysOf = (bio: string | null, owned: Set<string> = new Set()) =>
  selectNewlyGrantedProfile({ bio }, owned).map((c) => c.key);

describe("selectNewlyGrantedProfile: プロフィール起点の実績", () => {
  it("自己紹介を入力していれば bio-set が立つ", () => {
    expect(profileKeysOf("ねこがすきです")).toEqual(["bio-set"]);
  });

  it("未設定（null / 空文字）では立たない", () => {
    expect(profileKeysOf(null)).toEqual([]);
    expect(profileKeysOf("")).toEqual([]);
  });

  it("取得済みなら重複しない（消しても剥奪はしない＝再付与もしない）", () => {
    expect(profileKeysOf("ねこ", new Set(["bio-set"]))).toEqual([]);
  });

  it("投稿・リアクションの評価では絶対に立たない（評価タイミングが違う）", () => {
    expect(keysOf(stats({ totalPosts: 500 }), post())).not.toContain("bio-set");
    expect(reactionKeysOf(rstats({ given: 100, received: 1000 }))).not.toContain("bio-set");
  });
});
