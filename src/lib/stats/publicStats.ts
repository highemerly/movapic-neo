/**
 * 公開統計（/stats）のサービス全体集計。
 *
 * 対象は「公開面に出ている投稿」= isPublic かつ非表示でないもの（local 投稿・
 * モデレーション非表示は除外）。個人特定はせず、件数だけを groupBy で軽く集計する。
 *
 * 投稿スタイル（位置/サイズ/色/フォント/アレンジ）はシーズン投稿がプリセットで
 * スタイル列を上書きするため、ユーザーが自分で選んだ傾向を見るには season:null に絞る
 * （custom-options 実績と同じ隔離方針）。出力形式・投稿ソースは全公開投稿で集計する。
 */

import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  POSITION_LABELS,
  SIZE_LABELS,
  COLOR_LABELS,
  FONT_LABELS,
  ARRANGEMENT_LABELS,
  COLORS,
  VALID_POSITIONS,
  VALID_SIZES,
  VALID_COLORS,
  VALID_FONTS,
  VALID_ARRANGEMENTS,
} from "@/types";
import {
  CATALOG,
  CATALOG_BY_KEY,
  resolveAchievement,
  type AchievementRank,
} from "@/lib/achievements/catalog";

/** 公開面に出ている投稿の共通フィルタ。 */
const PUBLIC_WHERE = { isPublic: true, isDisabled: false } as const;

const SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  email: "メール",
  mention: "Bot",
};

const SERVER_TYPE_LABELS: Record<string, string> = {
  mastodon: "Mastodon",
  misskey: "Misskey",
};

export interface OptionCount {
  key: string;
  label: string;
  count: number;
  /** 色オプション用のスウォッチ（CSS カラー）。 */
  swatch?: string;
}

export interface OptionBreakdown {
  /** 表示見出し（例: "位置"） */
  title: string;
  /** この内訳の合計件数 */
  total: number;
  items: OptionCount[];
}

type GroupRow = { _count: { _all: number } };

/** groupBy 結果を value→件数の Map に畳む。 */
function countMap(rows: GroupRow[], field: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = (r as Record<string, unknown>)[field];
    m.set(typeof v === "string" ? v : String(v), r._count._all);
  }
  return m;
}

/** 既知の並び順＋ラベルで内訳を組み立て、未知値は末尾に足して件数降順に並べる。 */
function buildBreakdown(
  title: string,
  map: Map<string, number>,
  order: readonly string[],
  labels: Record<string, string>,
  swatchOf?: (key: string) => string | undefined,
): OptionBreakdown {
  const items: OptionCount[] = order.map((k) => ({
    key: k,
    label: labels[k] ?? k,
    count: map.get(k) ?? 0,
    swatch: swatchOf?.(k),
  }));
  for (const [k, c] of map) {
    if (!order.includes(k)) items.push({ key: k, label: labels[k] ?? k, count: c });
  }
  const total = items.reduce((a, i) => a + i.count, 0);
  items.sort((a, b) => b.count - a.count);
  return { title, total, items };
}

/** 投稿オプションの利用傾向（サービス全体・公開投稿）。 */
async function getOptionStats(): Promise<OptionBreakdown[]> {
  // スタイル系はシーズンのプリセットを除外（ユーザーが自分で選んだ傾向を見る）
  const styleWhere = { ...PUBLIC_WHERE, season: null } satisfies Prisma.ImageWhereInput;
  const count = { _all: true } as const;

  const [pos, size, color, font, arr] = await Promise.all([
    prisma.image.groupBy({ by: ["position"], where: styleWhere, _count: count }),
    prisma.image.groupBy({ by: ["size"], where: styleWhere, _count: count }),
    prisma.image.groupBy({ by: ["color"], where: styleWhere, _count: count }),
    prisma.image.groupBy({ by: ["font"], where: styleWhere, _count: count }),
    prisma.image.groupBy({ by: ["arrangement"], where: styleWhere, _count: count }),
  ]);

  return [
    buildBreakdown("位置", countMap(pos, "position"), VALID_POSITIONS, POSITION_LABELS),
    buildBreakdown("サイズ", countMap(size, "size"), VALID_SIZES, SIZE_LABELS),
    buildBreakdown("文字色", countMap(color, "color"), VALID_COLORS, COLOR_LABELS, (k) => COLORS[k as keyof typeof COLORS]),
    buildBreakdown("フォント", countMap(font, "font"), VALID_FONTS, FONT_LABELS),
    buildBreakdown("アレンジ", countMap(arr, "arrangement"), VALID_ARRANGEMENTS, ARRANGEMENT_LABELS),
  ];
}

/** 投稿ソース（Web/Bot/メール）と Fediverse への投稿有無。 */
async function getPostingStats(): Promise<OptionBreakdown[]> {
  const count = { _all: true } as const;
  const [src, federated, localOnly] = await Promise.all([
    prisma.image.groupBy({ by: ["source"], where: PUBLIC_WHERE, _count: count }),
    // postId あり = 連携サーバーへ投稿済み。local 投稿は postId が付かない。
    prisma.image.count({ where: { ...PUBLIC_WHERE, postId: { not: null } } }),
    prisma.image.count({ where: { ...PUBLIC_WHERE, postId: null } }),
  ]);

  const fediverse: OptionBreakdown = {
    title: "Fediverseへの投稿",
    total: federated + localOnly,
    items: [
      { key: "federated", label: "Fediverseに投稿", count: federated },
      { key: "local", label: "このサービスのみ", count: localOnly },
    ].sort((a, b) => b.count - a.count),
  };

  return [
    buildBreakdown("投稿ソース", countMap(src, "source"), ["web", "email", "mention"], SOURCE_LABELS),
    fediverse,
  ];
}

export interface AchievementStatRow {
  key: string;
  /** シークレット実績はネタバレ防止のため "？？？" に伏せる。 */
  title: string;
  rank: AchievementRank;
  secret: boolean;
  /** この実績を持つユーザー数 */
  holders: number;
}

export interface AchievementSection {
  title: string;
  rows: AchievementStatRow[];
}

export interface AchievementStats {
  /** 取得率の分母（登録ユーザー総数） */
  totalUsers: number;
  sections: AchievementSection[];
}

// セクション表示順（catalog の SECTIONS ＋ 動的キー分を追加）
const SECTION_ORDER = [
  "デビュー",
  "投稿数",
  "使いこなし",
  "リアクション",
  "期間限定",
  "皆勤賞",
  "シークレット",
  "その他",
] as const;

/** 実績の取得状況（サービス全体・key ごとの保有ユーザー数）。 */
async function getAchievementStats(): Promise<AchievementStats> {
  const [totalUsers, grouped] = await Promise.all([
    prisma.user.count(),
    prisma.achievement.groupBy({ by: ["key"], _count: { _all: true } }),
  ]);
  const holders = new Map(grouped.map((g) => [g.key, g._count._all]));

  // ラダー（段階実績）は「ユーザー分布」（getDistributionStats）で実数値を見せるため、
  // ここでは単発実績と動的キー（皆勤賞・シーズン）だけを取得率として扱う。
  const isLadder = (key: string) => !!CATALOG_BY_KEY.get(key)?.ladderKey;
  const keys = new Set<string>([
    ...CATALOG.filter((d) => !d.ladderKey).map((d) => d.key),
    ...[...holders.keys()].filter((k) => !isLadder(k)),
  ]);

  const rows: (AchievementStatRow & { section: string })[] = [...keys].map((key) => {
    const def = CATALOG_BY_KEY.get(key);
    const resolved = resolveAchievement(key);
    const secret = def?.secret ?? false;
    return {
      key,
      title: secret ? "？？？" : resolved.title,
      rank: resolved.rank,
      secret,
      holders: holders.get(key) ?? 0,
      section: resolved.section,
    };
  });

  const bySection = new Map<string, AchievementStatRow[]>();
  for (const { section, ...row } of rows) {
    const list = bySection.get(section) ?? [];
    list.push(row);
    bySection.set(section, list);
  }

  const order = (s: string) => {
    const i = SECTION_ORDER.indexOf(s as (typeof SECTION_ORDER)[number]);
    return i === -1 ? SECTION_ORDER.length : i;
  };

  const sections: AchievementSection[] = [...bySection.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([title, list]) => ({
      title,
      rows: list.sort((a, b) => b.holders - a.holders),
    }));

  return { totalUsers, sections };
}

export interface DistributionBreakdown {
  /** 表示見出し（例: "投稿数"） */
  title: string;
  /** この指標を持つユーザー数（＝バケットの合計） */
  total: number;
  items: OptionCount[];
}

/** バケット境界。1 は「その指標を持つ」下限として必ず含める。 */
function bucketEdges(tiers: number[]): number[] {
  return [...new Set([1, ...tiers])].sort((a, b) => a - b);
}

/**
 * 値が入るバケットのキー。最小境界未満（＝その指標を持たない）は null。
 * 全体のヒストグラムと閲覧者本人の位置判定でこの1本を共有する（判定のズレ防止）。
 */
export function bucketKey(value: number, tiers: number[]): string | null {
  const edges = bucketEdges(tiers);
  const v = Number(value);
  if (!Number.isFinite(v) || v < edges[0]) return null;
  let lo = edges[0];
  for (let i = edges.length - 1; i >= 0; i--) {
    if (v >= edges[i]) {
      lo = edges[i];
      break;
    }
  }
  return `b${lo}`;
}

/**
 * 実際の数値でユーザーをバケットに振り分けたヒストグラム1行分。
 * バケット境界はラダー実績のしきい値（catalog と一致）から作る。
 * v < 最小境界（＝その指標を持たない）ユーザーは対象外。
 */
function histogram(
  title: string,
  values: number[],
  tiers: number[],
  unit: string,
): DistributionBreakdown {
  const edges = bucketEdges(tiers);
  const counts = new Map<string, number>();
  for (const raw of values) {
    const key = bucketKey(Number(raw), tiers);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const items: OptionCount[] = edges.map((lo, i) => {
    const hi = edges[i + 1];
    const label = hi
      ? hi - 1 === lo
        ? `${lo}${unit}`
        : `${lo}〜${hi - 1}${unit}`
      : `${lo}${unit}〜`;
    return { key: `b${lo}`, label, count: counts.get(`b${lo}`) ?? 0 };
  });
  return { title, total: items.reduce((a, c) => a + c.count, 0), items };
}

/** $queryRaw の bigint/number を安全に数値配列へ。 */
function column(rows: Record<string, unknown>[], key: string): number[] {
  return rows.map((r) => Number(r[key]));
}

const PUBLIC_SQL = Prisma.sql`is_public = true AND is_disabled = false`;
// JST 日付（UTC とみなして Asia/Tokyo へ変換 → date）。timeseries.ts と同一 idiom。
const JST_DATE = Prisma.sql`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo')::date`;

/** ヒストグラムの取得元（生SQL 1本＝1ソース）。 */
type DistributionSource = "main" | "daily" | "streak" | "reaction";

interface DistributionDef {
  title: string;
  source: DistributionSource;
  /** 取得元行のカラム名 */
  field: string;
  /** バケット境界（ラダー実績のしきい値と一致） */
  tiers: number[];
  unit: string;
}

/** サーバー種別分布（カテゴリ）の見出し。閲覧者の位置合わせでも参照する。 */
export const SERVER_TYPE_TITLE = "サーバーの種類";

/**
 * ヒストグラム分布の定義。全体集計と閲覧者本人のバケット判定で同じ定義を使うため、
 * 指標（取得元・カラム・境界）はここ1箇所にだけ書く。
 */
const DISTRIBUTION_DEFS: DistributionDef[] = [
  { title: "投稿数", source: "main", field: "posts", tiers: [5, 10, 20, 30, 50, 100, 200, 300, 500], unit: "" },
  { title: "1日の最多投稿数", source: "daily", field: "daily", tiers: [3, 5, 10], unit: "" },
  { title: "連続投稿（最長）", source: "streak", field: "streak", tiers: [2, 7, 20, 50, 100], unit: "日" },
  { title: "使った文字色数", source: "main", field: "colors", tiers: [4, 8], unit: "色" },
  { title: "カメラ機種数", source: "main", field: "cameras", tiers: [2, 5], unit: "機種" },
  { title: "都道府県数", source: "main", field: "prefectures", tiers: [2, 5, 15, 30, 47], unit: "都道府県" },
  { title: "ネオンの利用回数", source: "main", field: "neon", tiers: [5, 30], unit: "回" },
  { title: "ハンコの利用回数", source: "main", field: "stamp", tiers: [5, 30], unit: "回" },
  { title: "特大文字の利用回数", source: "main", field: "xlarge", tiers: [5, 30], unit: "回" },
  { title: "縦書きの利用回数", source: "main", field: "vertical", tiers: [1, 5, 30, 100], unit: "回" },
  { title: "カスタム絵文字リアクション数", source: "reaction", field: "custom_reactions", tiers: [5, 30, 100, 300], unit: "件" },
  { title: "獲得したリアクション数", source: "main", field: "received_reactions", tiers: [10, 50, 100, 300, 1000], unit: "件" },
];

/**
 * 分布集計の生SQL（ユーザー1人=1行）。userId を渡すとその1人だけに絞る。
 * 全体集計と閲覧者本人で同じSQLを使うことで、集計定義のズレを防ぐ。
 * スタイル由来（色・ネオン等）はシーズン投稿を除外（ユーザーが選んだ分だけ）。
 */
function distributionSql(userId?: string): Record<DistributionSource, Prisma.Sql> {
  const imageUser = userId ? Prisma.sql`AND user_id = ${userId}` : Prisma.empty;
  const reactionUser = userId ? Prisma.sql`WHERE user_id = ${userId}` : Prisma.empty;
  return {
    main: Prisma.sql`
      SELECT
        COUNT(*)::int AS posts,
        COUNT(*) FILTER (WHERE arrangement = 'neon' AND season IS NULL)::int AS neon,
        COUNT(*) FILTER (WHERE arrangement = 'stamp' AND season IS NULL)::int AS stamp,
        COUNT(*) FILTER (WHERE size = 'extra-large' AND season IS NULL)::int AS xlarge,
        COUNT(*) FILTER (WHERE position IN ('left','right') AND season IS NULL)::int AS vertical,
        COUNT(DISTINCT color) FILTER (WHERE season IS NULL)::int AS colors,
        COUNT(DISTINCT camera_model) FILTER (WHERE camera_model IS NOT NULL)::int AS cameras,
        COUNT(DISTINCT location_prefecture) FILTER (WHERE location_prefecture IS NOT NULL)::int AS prefectures,
        -- favorite_count は連合キャッシュと Reaction をマージ済みの表示用合計（実績と同じ数え方）
        COALESCE(SUM(favorite_count), 0)::int AS received_reactions
      FROM images
      WHERE ${PUBLIC_SQL} ${imageUser}
      GROUP BY user_id
    `,
    // 1日の最多投稿数（JST 日単位でのユーザーごとの最大件数）
    daily: Prisma.sql`
      SELECT MAX(c)::int AS daily FROM (
        SELECT user_id, ${JST_DATE} AS d, COUNT(*) AS c
        FROM images WHERE ${PUBLIC_SQL} ${imageUser}
        GROUP BY user_id, d
      ) t GROUP BY user_id
    `,
    // 最長連続投稿日数（gaps-and-islands・JST）
    streak: Prisma.sql`
      WITH days AS (
        SELECT DISTINCT user_id, ${JST_DATE} AS d
        FROM images WHERE ${PUBLIC_SQL} ${imageUser}
      ),
      grp AS (
        SELECT user_id, d,
          (d - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d))::int) AS g
        FROM days
      )
      SELECT MAX(cnt)::int AS streak FROM (
        SELECT user_id, g, COUNT(*)::int AS cnt FROM grp GROUP BY user_id, g
      ) t GROUP BY user_id
    `,
    // カスタム絵文字で押したリアクション数（キーは ":name@host:"＝先頭が ":" のもの）
    reaction: Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE emoji LIKE ':%')::int AS custom_reactions
      FROM reactions
      ${reactionUser}
      GROUP BY user_id
    `,
  };
}

/** 分布集計の生SQL 4本をまとめて実行する。 */
async function runDistributionSql(
  userId?: string
): Promise<Record<DistributionSource, Record<string, unknown>[]>> {
  const sql = distributionSql(userId);
  const [main, daily, streak, reaction] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>(sql.main),
    prisma.$queryRaw<Record<string, unknown>[]>(sql.daily),
    prisma.$queryRaw<Record<string, unknown>[]>(sql.streak),
    prisma.$queryRaw<Record<string, unknown>[]>(sql.reaction),
  ]);
  return { main, daily, streak, reaction };
}

/**
 * ラダー系指標の「実際の数値」によるユーザー分布（ヒストグラム）。
 */
async function getDistributionStats(): Promise<DistributionBreakdown[]> {
  const [instanceRows, rows] = await Promise.all([
    // サーバー種別（Mastodon/Misskey）ごとのユーザー数
    prisma.instance.findMany({
      select: { type: true, _count: { select: { users: true } } },
    }),
    runDistributionSql(),
  ]);

  // サーバー種別分布（カテゴリ。件数降順）
  const byType = new Map<string, number>();
  for (const r of instanceRows) {
    byType.set(r.type, (byType.get(r.type) ?? 0) + r._count.users);
  }
  const serverType: DistributionBreakdown = {
    title: SERVER_TYPE_TITLE,
    total: [...byType.values()].reduce((a, c) => a + c, 0),
    items: [...byType.entries()]
      .map(([k, c]) => ({ key: k, label: SERVER_TYPE_LABELS[k] ?? k, count: c }))
      .sort((a, b) => b.count - a.count),
  };

  return [
    serverType,
    ...DISTRIBUTION_DEFS.map((d) =>
      histogram(d.title, column(rows[d.source], d.field), d.tiers, d.unit)
    ),
  ];
}

/** 分布タイトル → 閲覧者本人が該当する行のキー（該当なしの指標は持たない）。 */
export type ViewerDistribution = Record<string, string>;

/**
 * 閲覧者本人が各分布のどこに入るかを、全体集計と同じ定義（同じSQL・同じ境界）で求める。
 * 全体統計（getCachedStats）はユーザー非依存で全訪問者共有のため、本人の値だけ別に引く。
 */
async function computeViewerDistribution(
  userId: string,
  instanceType: string
): Promise<ViewerDistribution> {
  const rows = await runDistributionSql(userId);
  const found: ViewerDistribution = { [SERVER_TYPE_TITLE]: instanceType };
  for (const d of DISTRIBUTION_DEFS) {
    // 公開投稿が無いユーザーは行自体が返らない（＝どのバケットにも入らない）。
    const row = rows[d.source][0];
    const key = row ? bucketKey(Number(row[d.field]), d.tiers) : null;
    if (key) found[d.title] = key;
  }
  return found;
}

/** 本人の分布位置も全体統計と同じ間隔でキャッシュする（引数がキャッシュキーに入る）。 */
export const getViewerDistribution = unstable_cache(
  computeViewerDistribution,
  ["viewer-distribution"],
  { revalidate: 300, tags: ["public-stats"] },
);

/**
 * 統計データ一式（ログインユーザー非依存）を 5 分キャッシュして全訪問者で共有する。
 * 重いフル走査クエリ（groupBy ×多数・per-user 生SQL）をアクセスごとに走らせず、
 * revalidate 間隔でだけ実行する。ヘッダー用の getCurrentUser() は cookie 依存なので
 * キャッシュに含めず呼び出し側で別途取得する。
 * （cacheComponents 未有効のため 'use cache' は使えず unstable_cache が正解。page.tsx と同方針）
 */
export const getCachedStats = unstable_cache(
  async () => {
    const [optionStats, postingStats, distributionStats, achievementStats] =
      await Promise.all([
        getOptionStats(),
        getPostingStats(),
        getDistributionStats(),
        getAchievementStats(),
      ]);
    return { optionStats, postingStats, distributionStats, achievementStats };
  },
  ["public-stats"],
  { revalidate: 300, tags: ["public-stats"] },
);
