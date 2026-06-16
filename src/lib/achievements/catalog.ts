/**
 * 実績（トロフィー）カタログ。
 *
 * サーバー（評価エンジン）とクライアント（実績タブ・通知ベル）の両方から読まれるので、
 * React やサーバー専用 API を import しないこと（型と streak のJST変換のみに依存）。
 *
 * 付与条件はすべて「到達」=「>=」で評価する（ユーザー確定仕様）。
 * 動的にキーが増える皆勤賞だけはカタログ配列に入れず evaluatePerfectMonth で扱う。
 */

import { toJstDateString } from "@/lib/streak";
import {
  PERFECT_MONTH_CATEGORY,
  daysInMonthOf,
  isPerfectMonth,
  perfectMonthKey,
} from "./perfectMonth";
import {
  DEFAULT_POSITION,
  DEFAULT_FONT,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_ARRANGEMENT,
} from "@/types";

// 皆勤賞の系列キーは perfectMonth.ts を単一ソースとし、互換のため catalog からも re-export する。
export { PERFECT_MONTH_CATEGORY };

/** 投稿後の集計値。live はDBから、backfill はメモリ上のリプレイから同じ形で渡す。 */
export interface AchStats {
  /** 累計投稿数（この投稿を含む） */
  totalPosts: number;
  /** 現在の連続投稿日数（JST） */
  currentStreak: number;
  /** この投稿の日（JST）の投稿数 */
  todayPosts: number;
  /** この投稿の月（JST）の、投稿があった distinct 日数 */
  distinctDaysInPostMonth: number;
  /** この投稿の月（JST）の日(1-31)→投稿数。皆勤賞の穴埋め（日付順マッチング）判定に使う。 */
  postMonthDayCounts: Record<number, number>;
  /** 機能別の累計利用回数 */
  featureCounts: { neon: number; stamp: number; xlarge: number; vertical: number };
  /** 使ったフォントの種類数 */
  distinctFonts: number;
  /** 使った文字色の種類数 */
  distinctColors: number;
  /** 投稿に使ったカメラ機種の種類数 */
  distinctCameraModels: number;
  /** 位置情報付き投稿の異なる都道府県数 */
  distinctPrefectures: number;
  /** メール経由の投稿が1件以上あるか */
  hasEmailPost: boolean;
  /** メンション（bot）経由の投稿が1件以上あるか */
  hasMentionPost: boolean;
  /** この投稿の日（JST）に投稿した source の種類数（web/email/mention） */
  distinctSourcesToday: number;
}

/** 今まさに作成された投稿そのものの属性。 */
export interface PostFacts {
  overlayText: string;
  position: string;
  font: string;
  color: string;
  size: string;
  arrangement: string;
  source: string; // "web" | "email" | "mention"
  cameraModel: string | null;
  locationPrefecture: string | null;
  /** 公開範囲。"local" は連携サーバーへ同時投稿しない（Fediverse未投稿） */
  visibility: string; // "public" | "unlisted" | "local"
  createdAt: Date;
}

/** 実績のランク（難易度）。段階実績は段ごとに割り当てる。 */
export type AchievementRank = "gold" | "silver";

export interface AchievementDef {
  /** 安定キー。例: "posts:50" / "feature:neon:5" / "first-post" */
  key: string;
  /** 系列キー（DBの category 列。タブ表示・通知導出のグルーピング用） */
  category: string;
  /** ランク（金/銀）。サマリーの金○銀○集計とカードのバッジ色に使う */
  rank: AchievementRank;
  /** 表示セクション見出し */
  section: string;
  /** 同一ラダー（段階実績）をまとめるキー。単発実績は undefined */
  ladderKey?: string;
  /** ラダー内の段階値（表示順・進捗に使用） */
  tier?: number;
  title: string;
  description: string;
  /** lucide アイコン名（UI 側のマップで解決） */
  icon: string;
  /** シークレット実績: 未達成のあいだ実績タブで「？？？」表示にする（達成で公開） */
  secret?: boolean;
  /** 条件成立判定（純粋関数。付与済み判定は呼び出し側） */
  evaluate: (s: AchStats, p: PostFacts) => boolean;
}

// ラダー（段階実績）のまとめ表示用メタ。ladderKey で引く。
export const LADDER_META: Record<string, { label: string; unit: string }> = {
  "post-count": { label: "投稿数", unit: "投稿" },
  streak: { label: "連続投稿", unit: "日連続" },
  daily: { label: "1日の投稿数", unit: "枚/日" },
  "feature:neon": { label: "ネオンの利用", unit: "回" },
  "feature:stamp": { label: "ハンコの利用", unit: "回" },
  "feature:xlarge": { label: "特大文字の利用", unit: "回" },
  "feature:vertical": { label: "縦書きの利用", unit: "回" },
  cameras: { label: "カメラ機種", unit: "機種" },
  prefectures: { label: "都道府県", unit: "都道府県" },
  colors: { label: "文字色", unit: "色" },
};

// セクション（カテゴリ）表示順
export const SECTIONS = ["デビュー", "投稿数", "使いこなし", "期間限定", "シークレット"] as const;

const cp = (s: string) => Array.from(s).length; // コードポイント長
const jstHour = (d: Date) => new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCHours(); // JSTの時(0-23)

// --- 累計投稿数（文字入れ師の段位） ---
const POST_COUNT_TITLES: Record<number, string> = {
  5: "筆をとった者",
  10: "常連",
  20: "一人前",
  30: "文字入れ職人",
  50: "文字入れ名人",
  100: "文字入れ師範",
  200: "文字入れの鉄人",
  300: "文字入れ仙人",
  500: "文字入れの神",
};
const postCount: AchievementDef[] = [5, 10, 20, 30, 50, 100, 200, 300, 500].map((n) => ({
  key: `posts:${n}`,
  category: "post-count",
  rank: n >= 100 ? "gold" : "silver",
  section: "投稿数",
  ladderKey: "post-count",
  tier: n,
  title: POST_COUNT_TITLES[n],
  description: `累計${n}枚投稿しました`,
  icon: "Images",
  evaluate: (s) => s.totalPosts >= n,
}));

// --- 連続投稿（初回到達で永続付与・炎が大きくなる） ---
const STREAK_TITLES: Record<number, string> = {
  2: "着火",
  7: "七日の灯",
  20: "かがり火",
  50: "烈火",
  100: "不滅の炎",
};
const streak: AchievementDef[] = [2, 7, 20, 50, 100].map((n) => ({
  key: `streak:${n}`,
  category: "streak",
  rank: n >= 50 ? "gold" : "silver",
  section: "投稿数",
  ladderKey: "streak",
  tier: n,
  title: STREAK_TITLES[n],
  description: `${n}日連続で投稿しました`,
  icon: "Flame",
  evaluate: (s) => s.currentStreak >= n,
}));

// --- 1日の投稿数 ---
const DAILY_TITLES: Record<number, string> = {
  3: "連投スイッチ",
  5: "忙しい日",
  10: "何があったの？",
};
const dailyBurst: AchievementDef[] = [3, 5, 10].map((n) => ({
  key: `daily:${n}`,
  category: "daily-burst",
  rank: n >= 10 ? "gold" : "silver",
  section: "投稿数",
  ladderKey: "daily",
  tier: n,
  title: DAILY_TITLES[n],
  description: `同じ日に${n}枚投稿しました`,
  icon: "Zap",
  evaluate: (s) => s.todayPosts >= n,
}));

// --- 機能の累計利用（4機能 × 2段階。5回=見習い / 30回=マスター） ---
const FEATURES: {
  f: keyof AchStats["featureCounts"];
  label: string;
  icon: string;
  tiers: number[];
  titles: Record<number, string>;
}[] = [
  { f: "neon", label: "ネオン", icon: "Sparkles", tiers: [5, 30], titles: { 5: "ネオンの灯", 30: "ネオンマスター" } },
  { f: "stamp", label: "ハンコ", icon: "Stamp", tiers: [5, 30], titles: { 5: "スタンプラリー", 30: "判子奉行" } },
  { f: "xlarge", label: "特大文字", icon: "ALargeSmall", tiers: [5, 30], titles: { 5: "主張強め", 30: "特大マスター" } },
  {
    f: "vertical",
    label: "縦書き",
    icon: "GalleryVerticalEnd",
    tiers: [1, 5, 30, 100],
    titles: { 1: "縦書き、はじめました", 5: "やっぱり縦書きだよね", 30: "書道師範", 100: "書聖" },
  },
];
const featureUsage: AchievementDef[] = FEATURES.flatMap(({ f, label, icon, tiers, titles }) =>
  tiers.map((n) => ({
    key: `feature:${f}:${n}`,
    category: "feature-usage",
    rank: n >= 30 ? "gold" : "silver",
    section: "使いこなし",
    ladderKey: `feature:${f}`,
    tier: n,
    title: titles[n],
    description: `${label}を累計${n}回使って投稿しました`,
    icon,
    evaluate: (s: AchStats) => s.featureCounts[f] >= n,
  }))
);

// --- カメラ機種 ---
const CAMERA_TITLES: Record<number, string> = {
  2: "二刀流カメラマン",
  5: "機材沼の住人",
};
const cameras: AchievementDef[] = [2, 5].map((n) => ({
  key: `cameras:${n}`,
  category: "camera-models",
  rank: n >= 5 ? "gold" : "silver",
  section: "使いこなし",
  ladderKey: "cameras",
  tier: n,
  title: CAMERA_TITLES[n],
  description: `異なるカメラ${n}機種で投稿しました`,
  icon: "Camera",
  evaluate: (s) => s.distinctCameraModels >= n,
}));

// --- 都道府県（位置情報付き投稿の異なる都道府県数・旅人の道） ---
const PREFECTURE_TITLES: Record<number, string> = {
  2: "旅のはじまり",
  5: "旅人",
  15: "行脚の人",
  30: "全国行脚",
  47: "日本制覇",
};
const prefectures: AchievementDef[] = [2, 5, 15, 30, 47].map((n) => ({
  key: `prefectures:${n}`,
  category: "prefectures",
  rank: n >= 30 ? "gold" : "silver",
  section: "使いこなし",
  ladderKey: "prefectures",
  tier: n,
  title: PREFECTURE_TITLES[n],
  description: `位置情報付き投稿で${n}都道府県に到達しました`,
  icon: "Map",
  evaluate: (s) => s.distinctPrefectures >= n,
}));

// --- 文字色（使った文字色の種類数） ---
const COLOR_TITLES: Record<number, string> = {
  4: "色とりどり",
  8: "色彩の魔術師",
};
const colors: AchievementDef[] = [4, 8].map((n) => ({
  key: `colors:${n}`,
  category: "colors",
  rank: n >= 8 ? "gold" : "silver",
  section: "使いこなし",
  ladderKey: "colors",
  tier: n,
  title: COLOR_TITLES[n],
  description: `${n}色の文字色を使って投稿しました`,
  icon: "Rainbow",
  evaluate: (s) => s.distinctColors >= n,
}));

// --- 単発実績 ---
const singletons: AchievementDef[] = [
  {
    key: "first-post",
    category: "first-post",
    rank: "silver",
    section: "デビュー",
    title: "デビュー作",
    description: "記念すべき1枚目を投稿しました",
    icon: "Star",
    evaluate: (s) => s.totalPosts >= 1,
  },
  {
    key: "long-text",
    category: "long-text",
    rank: "gold",
    section: "シークレット",
    secret: true,
    title: "饒舌な一枚",
    description: "1枚に130文字以上の文字を入れました",
    icon: "Pilcrow",
    evaluate: (_s, p) => cp(p.overlayText) >= 130,
  },
  {
    key: "custom-options",
    category: "custom-options",
    rank: "silver",
    section: "使いこなし",
    title: "こだわり派",
    description: "デフォルト以外の装飾オプションで投稿しました",
    icon: "Palette",
    evaluate: (_s, p) =>
      p.position !== DEFAULT_POSITION ||
      p.font !== DEFAULT_FONT ||
      p.color !== DEFAULT_COLOR ||
      p.size !== DEFAULT_SIZE ||
      p.arrangement !== DEFAULT_ARRANGEMENT,
  },
  {
    key: "all-fonts",
    category: "all-fonts",
    rank: "gold",
    section: "シークレット",
    secret: true,
    title: "フォント博士",
    description: "3種類すべてのフォントを使いました",
    icon: "Type",
    evaluate: (s) => s.distinctFonts >= 3,
  },
  {
    key: "one-char",
    category: "one-char",
    rank: "silver",
    section: "シークレット",
    secret: true,
    title: "一文字入魂",
    description: "たった1文字だけ入れて投稿しました",
    icon: "Feather",
    evaluate: (_s, p) => cp(p.overlayText) === 1,
  },
  {
    key: "new-year-writing",
    category: "new-year-writing",
    rank: "gold",
    section: "シークレット",
    secret: true,
    title: "書き初め",
    description: "元日（1月1日）に投稿しました",
    icon: "Brush",
    evaluate: (_s, p) => toJstDateString(p.createdAt).slice(5) === "01-01",
  },
  {
    key: "first-email",
    category: "first-email",
    rank: "silver",
    section: "デビュー",
    title: "いにしえの投稿スタイル",
    description: "メール経由ではじめて投稿しました",
    icon: "Mail",
    evaluate: (s) => s.hasEmailPost,
  },
  {
    key: "first-mention",
    category: "first-mention",
    rank: "silver",
    section: "デビュー",
    title: "Bot召喚士",
    description: "メンション（bot）経由ではじめて投稿しました",
    icon: "AtSign",
    evaluate: (s) => s.hasMentionPost,
  },
  {
    key: "first-location",
    category: "first-location",
    rank: "silver",
    section: "デビュー",
    title: "はじめての地図",
    description: "位置情報付きではじめて投稿しました",
    icon: "MapPin",
    evaluate: (_s, p) => p.locationPrefecture != null,
  },
  {
    key: "hat-trick",
    category: "hat-trick",
    rank: "silver",
    section: "使いこなし",
    title: "ハットトリック",
    description: "1日にWeb・メール・Botの3経路すべてから投稿しました",
    icon: "SoccerBall",
    evaluate: (s) => s.distinctSourcesToday >= 3,
  },
  {
    key: "local-only",
    category: "local-only",
    rank: "silver",
    section: "デビュー",
    title: "Fediverseにはナイショ",
    description: "連携サーバーへ同時投稿しませんでした",
    icon: "EyeOff",
    evaluate: (_s, p) => p.visibility === "local",
  },
  {
    key: "early-bird",
    category: "early-bird",
    rank: "silver",
    section: "シークレット",
    secret: true,
    title: "早起き",
    description: "朝5〜7時台に投稿しました",
    icon: "Sunrise",
    evaluate: (_s, p) => {
      const h = jstHour(p.createdAt);
      return h >= 5 && h <= 7;
    },
  },
  {
    key: "night-owl",
    category: "night-owl",
    rank: "silver",
    section: "シークレット",
    secret: true,
    title: "夜更かし",
    description: "深夜0〜3時台に投稿しました",
    icon: "Moon",
    evaluate: (_s, p) => {
      const h = jstHour(p.createdAt);
      return h >= 0 && h <= 3;
    },
  },
  {
    // 投稿では付与しない。バックフィルスクリプトが登録日を見て一括配布する一度きりの記念実績。
    key: "early-adopter",
    category: "early-adopter",
    rank: "gold",
    section: "期間限定",
    title: "アーリーアダプター",
    description: "サービス初期から参加している証の記念実績",
    icon: "Rocket",
    evaluate: () => false,
  },
];

export const CATALOG: AchievementDef[] = [
  ...postCount,
  ...streak,
  ...dailyBurst,
  ...featureUsage,
  ...cameras,
  ...prefectures,
  ...colors,
  ...singletons,
];

/** key → 定義の逆引き（固定実績のみ） */
export const CATALOG_BY_KEY: Map<string, AchievementDef> = new Map(
  CATALOG.map((d) => [d.key, d])
);

/**
 * 実績タブの表示構成（カテゴリ＝section、表示順を明示的に定義）。
 * - ladder: 段階実績（閾値違い）を1枚にまとめる（ladderKey で CATALOG を引く）
 * - single: 単発実績（key で1件）
 * - perfectMonth: 皆勤賞（動的キー。獲得月ぶんカードを並べる）
 */
export type AchievementBlock =
  | { kind: "ladder"; ladderKey: string }
  | { kind: "single"; key: string }
  | { kind: "perfectMonth" };

export const ACHIEVEMENT_LAYOUT: { title: string; blocks: AchievementBlock[] }[] = [
  {
    title: "デビュー",
    blocks: [
      { kind: "single", key: "first-post" },
      { kind: "single", key: "first-location" },
      { kind: "single", key: "first-email" },
      { kind: "single", key: "first-mention" },
      { kind: "single", key: "local-only" },
    ],
  },
  {
    title: "投稿数",
    blocks: [
      { kind: "ladder", ladderKey: "post-count" },
      { kind: "ladder", ladderKey: "daily" },
      { kind: "ladder", ladderKey: "streak" },
      { kind: "perfectMonth" },
    ],
  },
  {
    title: "使いこなし",
    blocks: [
      { kind: "single", key: "custom-options" },
      { kind: "single", key: "hat-trick" },
      { kind: "ladder", ladderKey: "feature:neon" },
      { kind: "ladder", ladderKey: "feature:stamp" },
      { kind: "ladder", ladderKey: "feature:xlarge" },
      { kind: "ladder", ladderKey: "feature:vertical" },
      { kind: "ladder", ladderKey: "cameras" },
      { kind: "ladder", ladderKey: "prefectures" },
      { kind: "ladder", ladderKey: "colors" },
    ],
  },
  {
    title: "期間限定",
    blocks: [
      { kind: "single", key: "early-adopter" },
    ],
  },
  {
    title: "シークレット",
    blocks: [
      { kind: "single", key: "long-text" },
      { kind: "single", key: "one-char" },
      { kind: "single", key: "all-fonts" },
      { kind: "single", key: "new-year-writing" },
      { kind: "single", key: "early-bird" },
      { kind: "single", key: "night-owl" },
    ],
  },
];

/**
 * 皆勤賞（動的キー）。判定式は perfectMonth.ts の isPerfectMonth に集約。
 * 未投稿を GRACE 日まで許容し、その分を「後日のダブル投稿」で穴埋めできる（日付順マッチング）。
 */
export function evaluatePerfectMonth(s: AchStats, post: PostFacts): string | null {
  const ym = toJstDateString(post.createdAt).slice(0, 7); // "2026-06"
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const daysInMonth = daysInMonthOf(year, month);
  return isPerfectMonth({ daysInMonth, dayCounts: s.postMonthDayCounts })
    ? perfectMonthKey(ym)
    : null;
}

/** 表示用の解決済み実績情報。 */
export interface ResolvedAchievement {
  key: string;
  category: string;
  rank: AchievementRank;
  section: string;
  title: string;
  description: string;
  icon: string;
}

/** 獲得済みの key（動的キー含む）を表示情報に解決する。 */
export function resolveAchievement(key: string, category?: string): ResolvedAchievement {
  const def = CATALOG_BY_KEY.get(key);
  if (def) {
    return {
      key,
      category: def.category,
      rank: def.rank,
      section: def.section,
      title: def.title,
      description: def.description,
      icon: def.icon,
    };
  }
  // 動的: 皆勤賞（金ランク固定）
  if (key.startsWith(`${PERFECT_MONTH_CATEGORY}:`)) {
    const ym = key.slice(PERFECT_MONTH_CATEGORY.length + 1); // "2026-06"
    const [y, m] = ym.split("-");
    const label = `${y}年${Number(m)}月`;
    return {
      key,
      category: PERFECT_MONTH_CATEGORY,
      rank: "gold",
      section: "皆勤賞",
      title: `${label}の皆勤賞`,
      description: `${label}は皆勤賞を達成しました`,
      icon: "Crown",
    };
  }
  // フォールバック（未知キー）
  return {
    key,
    category: category ?? "unknown",
    rank: "silver",
    section: "その他",
    title: key,
    description: "",
    icon: "Trophy",
  };
}

/** 獲得済み実績リストを金/銀で集計する（純粋関数）。 */
export function countRanks(
  items: { key: string; category: string }[]
): { gold: number; silver: number } {
  let gold = 0;
  let silver = 0;
  for (const it of items) {
    if (resolveAchievement(it.key, it.category).rank === "gold") gold++;
    else silver++;
  }
  return { gold, silver };
}
