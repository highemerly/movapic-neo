/**
 * 実績（トロフィー）カタログ。
 *
 * サーバー（評価エンジン）とクライアント（実績タブ・通知ベル）の両方から読まれるので、
 * React やサーバー専用 API を import しないこと（型と streak のJST変換のみに依存）。
 *
 * 付与条件はすべて「到達」=「>=」で評価する（ユーザー確定仕様）。
 * 動的にキーが増える皆勤賞だけはカタログ配列に入れず evaluatePerfectMonth で扱う。
 */

import { toJstDateString, toJstHour } from "@/lib/streak";
import { seasonLabel } from "@/lib/seasons/catalog";
import { countGraphemes } from "@/lib/text/grapheme";
import {
  PERFECT_MONTH_CATEGORY,
  daysInMonthOf,
  isPerfectMonth,
  perfectMonthKey,
} from "./perfectMonth";

// シーズン（期間限定）実績の系列キーと安定キーの接頭辞。
// 皆勤賞と同じ「動的キー」方式: シーズン投稿1回でそのシーズンのバッジを獲得し、
// 実績名にはシーズン名（例: 七夕）を表示する。キーは season:<seasonKey>（永続）。
export const SEASON_CATEGORY = "season";
const SEASON_KEY_PREFIX = `${SEASON_CATEGORY}:`;
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
  /** この投稿の月（JST）の日(1-31)→投稿数。皆勤賞の distinct 日数・穴埋め判定に使う。 */
  postMonthDayCounts: Record<number, number>;
  /**
   * この投稿の月（JST）で、永続化された穴埋め割当（Image.makeupTargetDay）が指す空き日の一覧。
   * 皆勤賞判定は「貪欲の再計算」ではなくこの永続割当を数える（表示と👑の単一ソース）。
   * ③ON既存ユーザーは貪欲割当と一致するため判定は従来と不変。
   */
  filledHoleDays: number[];
  /** 投稿した月（JST の YYYY-MM）の通算種類数。連続と違い休止を挟んでも積み上がる。 */
  distinctPostMonths: number;
  /** 投稿した時間帯（JST の 0-23 時）の通算種類数。24 で時計を一周したことになる。 */
  distinctPostHours: number;
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

/**
 * リアクション由来の集計値。
 *
 * 投稿の瞬間には確定しない（自分がリアクションを押した／自分の投稿がリアクションを受け取った
 * ときに動く）ため、AchStats とは別立てにして評価タイミングも分ける（engine.ts の
 * selectNewlyGrantedReaction）。値はいずれも「今この瞬間の現在値」で、過去の累計ではない
 * （リアクションは取り消し・付け替えができ、履歴を持たないため）。実績は永続なので
 * 一度しきい値に到達すれば以後値が下がっても剥奪しない。
 */
export interface ReactionStats {
  /** 自分が SHAMEZO から押しているリアクションの件数 */
  given: number;
  /** うちカスタム絵文字（`:name@host:`）で押している件数 */
  givenCustomEmoji: number;
  /** 自分がリアクションしている写真の投稿者の人数（自分自身の写真は数えない） */
  givenDistinctOwners: number;
  /** 自分の投稿が獲得したリアクションの総数（表示合計＝Image.favoriteCount の総和） */
  received: number;
}

/** 今まさに作成された投稿そのものの属性。 */
export interface PostFacts {
  overlayText: string;
  position: string;
  font: string;
  color: string;
  size: string;
  arrangement: string;
  /** シーズン（期間限定）キー。null=通常投稿。セット時に season:<key> 実績を付与 */
  season: string | null;
  source: string; // "web" | "email" | "mention"
  cameraModel: string | null;
  locationPrefecture: string | null;
  /** 公開範囲。"local" は連携サーバーへ同時投稿しない（Fediverse未投稿） */
  visibility: string; // "public" | "unlisted" | "local"
  createdAt: Date;
}

/**
 * プロフィール（自己紹介）の現在値。
 *
 * 投稿にもリアクションにも紐づかず、プロフィールを保存した瞬間にしか動かないため、
 * AchStats / ReactionStats とは別立てにする（評価は engine.ts の selectNewlyGrantedProfile）。
 * 集計値ではなく保存後の実値そのもの＝ライターが1箇所（PATCH /api/v1/me）しかないため。
 */
export interface ProfileFacts {
  /** 保存後の自己紹介。null または空文字＝未設定 */
  bio: string | null;
}

/** 実績のランク（難易度）。段階実績は段ごとに割り当てる。 */
export type AchievementRank = "gold" | "silver";

/** 表示に必要な属性（評価述語を除く共通部分）。UI・集計は全てここだけを見る。 */
export interface AchievementMeta {
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
}

/** 投稿の瞬間に評価する実績（既定）。集計は AchStats、投稿の属性は PostFacts から読む。 */
export type PostAchievementDef = AchievementMeta & {
  trigger?: "post";
  /** 条件成立判定（純粋関数。付与済み判定は呼び出し側） */
  evaluate: (s: AchStats, p: PostFacts) => boolean;
};

/**
 * リアクションが動いた瞬間に評価する実績。
 * 投稿フック（publishImage）では確定できないため、リアクションの書き込み経路から評価する
 * （src/lib/achievements/reactionTriggers.ts）。
 */
export type ReactionAchievementDef = AchievementMeta & {
  trigger: "reaction";
  evaluate: (s: ReactionStats) => boolean;
};

/**
 * プロフィールを保存した瞬間に評価する実績。
 * 投稿もリアクションも経由しないため、PATCH /api/v1/me からだけ評価する
 * （src/lib/achievements/profileTriggers.ts）。
 */
export type ProfileAchievementDef = AchievementMeta & {
  trigger: "profile";
  evaluate: (p: ProfileFacts) => boolean;
};

export type AchievementDef =
  | PostAchievementDef
  | ReactionAchievementDef
  | ProfileAchievementDef;

/**
 * trigger 別の絞り込み。評価ループは必ずこれを通す。
 * 「自分の系統以外を continue」ではなく「自分の系統だけを通す」形にしないと、
 * trigger を増やしたときに既存ループへ漏れ込み、別の型の引数で evaluate が呼ばれる。
 */
export function isPostAchievement(d: AchievementDef): d is PostAchievementDef {
  return d.trigger === undefined || d.trigger === "post";
}
export function isReactionAchievement(d: AchievementDef): d is ReactionAchievementDef {
  return d.trigger === "reaction";
}
export function isProfileAchievement(d: AchievementDef): d is ProfileAchievementDef {
  return d.trigger === "profile";
}

// ラダー（段階実績）のまとめ表示用メタ。ladderKey で引く。
export const LADDER_META: Record<string, { label: string; unit: string }> = {
  "post-count": { label: "投稿数", unit: "投稿" },
  streak: { label: "連続投稿", unit: "日連続" },
  months: { label: "投稿した月数", unit: "ヶ月" },
  daily: { label: "1日の投稿数", unit: "枚/日" },
  "feature:neon": { label: "ネオンの利用", unit: "回" },
  "feature:stamp": { label: "ハンコの利用", unit: "回" },
  "feature:xlarge": { label: "特大文字の利用", unit: "回" },
  "feature:vertical": { label: "縦書きの利用", unit: "回" },
  cameras: { label: "カメラ機種", unit: "機種" },
  prefectures: { label: "都道府県", unit: "都道府県" },
  colors: { label: "文字色", unit: "色" },
  "reaction-custom": { label: "カスタム絵文字リアクション", unit: "件" },
  "reaction-users": { label: "応援した人数", unit: "人" },
  "reaction-received": { label: "獲得したリアクション", unit: "件" },
};

// セクション（カテゴリ）表示順
export const SECTIONS = [
  "デビュー",
  "投稿数",
  "使いこなし",
  "リアクション",
  "期間限定",
  "シークレット",
] as const;

// 文字数は書記素（grapheme）ベースで数える。入力バリデーション（UI/各API）と同一の
// 数え方に統一し、絵文字1個＝1文字として実績条件（1文字 / 130文字以上）を判定する。
const cp = (s: string) => countGraphemes(s);

// --- 累計投稿数（文字入れ師の段位） ---
const POST_COUNT_TITLES: Record<number, string> = {
  5: "筆をとった者",
  10: "常連",
  20: "一人前",
  30: "文字入れ職人",
  50: "SHAMEZO名人",
  100: "写真師範",
  200: "表現の鉄人",
  300: "言の葉の仙人",
  500: "SHAMEZOの神",
  1000: "神をこえた者",
};
const postCount: PostAchievementDef[] = [5, 10, 20, 30, 50, 100, 200, 300, 500, 1000].map((n) => ({
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
  7: "焚き火",
  20: "かがり火",
  50: "燃ゆる星",
  100: "太陽",
};
const streak: PostAchievementDef[] = [2, 7, 20, 50, 100].map((n) => ({
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

// --- 投稿した月数（歯抜けでも積み上がる「歴」。連続投稿が途切れても進む軸） ---
const MONTHS_TITLES: Record<number, string> = {
  6: "半年もの",
  12: "一年もの",
  24: "二年の常連",
  36: "三年の主",
};
const postMonths: PostAchievementDef[] = [6, 12, 24, 36].map((n) => ({
  key: `months:${n}`,
  category: "post-months",
  rank: n >= 24 ? "gold" : "silver",
  section: "投稿数",
  ladderKey: "months",
  tier: n,
  title: MONTHS_TITLES[n],
  description: `投稿した月が通算${n}ヶ月になりました`,
  icon: "CalendarDays",
  evaluate: (s) => s.distinctPostMonths >= n,
}));

// --- 1日の投稿数 ---
const DAILY_TITLES: Record<number, string> = {
  3: "連投スイッチ",
  5: "忙しい日",
  10: "何があったの？",
};
const dailyBurst: PostAchievementDef[] = [3, 5, 10].map((n) => ({
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
  {
    f: "neon",
    label: "ネオン",
    icon: "Sparkles",
    tiers: [5, 30, 100],
    titles: { 5: "ネオンの灯", 30: "ネオンマスター", 100: "不夜城" },
  },
  {
    f: "stamp",
    label: "ハンコ",
    icon: "Stamp",
    tiers: [5, 30, 100],
    titles: { 5: "スタンプラリー", 30: "判子奉行", 100: "押しも押されぬ" },
  },
  {
    f: "xlarge",
    label: "特大文字",
    icon: "ALargeSmall",
    tiers: [5, 30, 100],
    titles: { 5: "主張強め", 30: "声が大きいです", 100: "もう聞こえてます" },
  },
  {
    f: "vertical",
    label: "縦書き",
    icon: "GalleryVerticalEnd",
    tiers: [1, 5, 30, 100],
    titles: { 1: "縦書き、はじめました", 5: "やっぱり縦書きだよね", 30: "書道初段", 100: "書道の達人" },
  },
];
const featureUsage: PostAchievementDef[] = FEATURES.flatMap(({ f, label, icon, tiers, titles }) =>
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
  5: "カメラコレクター",
};
const cameras: PostAchievementDef[] = [2, 5].map((n) => ({
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
const prefectures: PostAchievementDef[] = [2, 5, 15, 30, 47].map((n) => ({
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
const colors: PostAchievementDef[] = [4, 8].map((n) => ({
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

// --- カスタム絵文字で押したリアクション（自分が押した側） ---
const CUSTOM_REACTION_TITLES: Record<number, string> = {
  5: "気持ちを添えて",
  30: "心を込めて",
  100: "見たら押す人",
  300: "絵文字団長",
};
const customEmojiReactions: ReactionAchievementDef[] = [5, 30, 100, 300].map((n) => ({
  key: `reaction:custom:${n}`,
  category: "reaction-custom",
  rank: n >= 300 ? "gold" : "silver",
  section: "リアクション",
  ladderKey: "reaction-custom",
  tier: n,
  trigger: "reaction",
  title: CUSTOM_REACTION_TITLES[n],
  description: `カスタム絵文字で累計${n}件のリアクションをしました`,
  icon: "Sticker",
  evaluate: (s) => s.givenCustomEmoji >= n,
}));

// --- 応援した人数（自分がリアクションした写真の投稿者数。件数ではなく「広さ」の軸） ---
const SUPPORTED_USER_TITLES: Record<number, string> = {
  10: "みんなの味方",
  20: "顔が広い",
  30: "応援部員",
  50: "応援団長",
  100: "友達100人できるかな",
};
const supportedUsers: ReactionAchievementDef[] = [10, 20, 30, 50, 100].map((n) => ({
  key: `reaction:users:${n}`,
  category: "reaction-users",
  rank: n >= 30 ? "gold" : "silver",
  section: "リアクション",
  ladderKey: "reaction-users",
  tier: n,
  trigger: "reaction",
  title: SUPPORTED_USER_TITLES[n],
  description: `${n}人の写真にリアクションしました`,
  icon: "Users",
  evaluate: (s) => s.givenDistinctOwners >= n,
}));

// --- 獲得したリアクション総数（自分の投稿が受け取った側） ---
const RECEIVED_REACTION_TITLES: Record<number, string> = {
  10: "線香花火",
  50: "小さな花火",
  100: "打ち上げ花火",
  300: "花火大会",
  1000: "夜空を埋めつくす花火",
};
const receivedReactions: ReactionAchievementDef[] = [10, 50, 100, 300, 1000].map((n) => ({
  key: `reaction:received:${n}`,
  category: "reaction-received",
  rank: n >= 300 ? "gold" : "silver",
  section: "リアクション",
  ladderKey: "reaction-received",
  tier: n,
  trigger: "reaction",
  title: RECEIVED_REACTION_TITLES[n],
  description: `自分の投稿が累計${n}件のリアクションを獲得しました`,
  icon: "Heart",
  evaluate: (s) => s.received >= n,
}));

// --- 単発実績（リアクション起点） ---
const reactionSingletons: ReactionAchievementDef[] = [
  {
    key: "first-reaction",
    category: "first-reaction",
    rank: "silver",
    section: "デビュー",
    trigger: "reaction",
    title: "はじめてのリアクション",
    description: "SHAMEZOからはじめてリアクションをしました",
    icon: "SmilePlus",
    evaluate: (s) => s.given >= 1,
  },
];

// --- 単発実績（プロフィール起点） ---
const profileSingletons: ProfileAchievementDef[] = [
  {
    key: "bio-set",
    category: "bio-set",
    rank: "silver",
    section: "デビュー",
    trigger: "profile",
    title: "はじめまして",
    description: "プロフィールに自己紹介を入力しました",
    icon: "IdCard",
    // 空文字は API 側で null に正規化されるが、判定はここでも空を弾いておく
    // （このカタログは live/backfill 双方から呼ばれ、後者は DB の生値を渡すため）。
    evaluate: (p) => p.bio != null && p.bio.length > 0,
  },
];

// --- 単発実績 ---
const singletons: PostAchievementDef[] = [
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
    // シーズン投稿はスタイルをユーザーが選んでいない（プリセット）ので対象外（案Bの隔離）。
    evaluate: (_s, p) =>
      p.season == null &&
      (p.position !== DEFAULT_POSITION ||
        p.font !== DEFAULT_FONT ||
        p.color !== DEFAULT_COLOR ||
        p.size !== DEFAULT_SIZE ||
        p.arrangement !== DEFAULT_ARRANGEMENT),
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
      const h = toJstHour(p.createdAt);
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
      const h = toJstHour(p.createdAt);
      return h >= 0 && h <= 3;
    },
  },
  {
    key: "all-hours",
    category: "all-hours",
    rank: "gold",
    section: "シークレット",
    secret: true,
    title: "時計をひとまわり",
    description: "0時から23時まで、24すべての時間帯に投稿しました",
    icon: "Clock",
    evaluate: (s) => s.distinctPostHours >= 24,
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
  ...postMonths,
  ...dailyBurst,
  ...featureUsage,
  ...cameras,
  ...prefectures,
  ...colors,
  ...singletons,
  ...customEmojiReactions,
  ...supportedUsers,
  ...receivedReactions,
  ...reactionSingletons,
  ...profileSingletons,
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
  | { kind: "perfectMonth" }
  | { kind: "season" };

export const ACHIEVEMENT_LAYOUT: { title: string; blocks: AchievementBlock[] }[] = [
  {
    title: "デビュー",
    blocks: [
      { kind: "single", key: "first-post" },
      { kind: "single", key: "first-location" },
      { kind: "single", key: "first-email" },
      { kind: "single", key: "first-mention" },
      { kind: "single", key: "local-only" },
      { kind: "single", key: "first-reaction" },
      { kind: "single", key: "bio-set" },
    ],
  },
  {
    title: "投稿数",
    blocks: [
      { kind: "ladder", ladderKey: "post-count" },
      { kind: "ladder", ladderKey: "daily" },
      { kind: "ladder", ladderKey: "streak" },
      { kind: "ladder", ladderKey: "months" },
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
    title: "リアクション",
    blocks: [
      { kind: "ladder", ladderKey: "reaction-custom" },
      { kind: "ladder", ladderKey: "reaction-users" },
      { kind: "ladder", ladderKey: "reaction-received" },
    ],
  },
  {
    title: "期間限定",
    blocks: [
      { kind: "season" },
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
      { kind: "single", key: "all-hours" },
    ],
  },
];

/**
 * 皆勤賞（動的キー）。判定式は perfectMonth.ts の isPerfectMonth に集約。
 * 未投稿を grace 日（投稿者の所属インスタンスで決定）まで許容し、その分を
 * 「後日のダブル投稿」で穴埋めできる（日付順マッチング）。grace は呼び出し側が渡す。
 */
export function evaluatePerfectMonth(s: AchStats, post: PostFacts, grace: number): string | null {
  const ym = toJstDateString(post.createdAt).slice(0, 7); // "2026-06"
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const daysInMonth = daysInMonthOf(year, month);
  return isPerfectMonth({
    daysInMonth,
    dayCounts: s.postMonthDayCounts,
    filledHoleDays: s.filledHoleDays,
    grace,
  })
    ? perfectMonthKey(ym)
    : null;
}

/**
 * シーズン（期間限定）実績（動的キー）。シーズン投稿をした瞬間にそのシーズンのバッジを獲得。
 * 集計（AchStats）は不要 — その投稿が season を持つかだけで決まる。2枚目以降は
 * ownedKeys 重複で自動的に二重付与されない。返すキーは season:<seasonKey>。
 */
export function evaluateSeason(post: PostFacts): string | null {
  return post.season ? `${SEASON_KEY_PREFIX}${post.season}` : null;
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
  // 動的: シーズン（期間限定・金ランク固定）。実績名はシーズン名（例: 七夕）。
  if (key.startsWith(SEASON_KEY_PREFIX)) {
    const seasonKey = key.slice(SEASON_KEY_PREFIX.length);
    const label = seasonLabel(seasonKey);
    return {
      key,
      category: SEASON_CATEGORY,
      rank: "gold",
      section: "期間限定",
      title: label,
      description: `${label}シーズンに投稿しました`,
      icon: "Sparkles",
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
