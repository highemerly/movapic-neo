/**
 * /admin/stats のグラフ用時系列。JST バケットで投稿数（線）＋ お気に入り同期状態（棒）を集計する。
 *
 * fav 同期状態の3分類は「補集合」で定義し、favoritable な投稿を漏れなく分割する:
 *   - 未同期  : favorites_synced_at IS NULL
 *   - 直近200 : favorites_synced_at IS NOT NULL AND post_status = 200
 *   - エラー  : favorites_synced_at IS NOT NULL AND post_status <> 200（NULL/3xx も含む＝補集合）
 * local 投稿（post_id なし）は fav 対象外なので棒の積み上げ合計 ≤ 線（総投稿数）になる。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

export type TimeRange = "31d" | "7d" | "1d";

export interface TimeBucket {
  /** 軸ラベル（daily=MM/DD, hourly=HH時） */
  label: string;
  /** ツールチップ用の詳細ラベル */
  fullLabel: string;
  /** そのバケットの総投稿数（全 source） */
  posts: number;
  /** うち favoritable で未同期 */
  unsynced: number;
  /** うち favoritable で直近200 */
  ok: number;
  /** うち favoritable で直近エラー（補集合） */
  err: number;
}

interface RangeConfig {
  unit: "day" | "hour";
  /** バケット数 */
  count: number;
}

const RANGES: Record<TimeRange, RangeConfig> = {
  "31d": { unit: "day", count: 31 },
  "7d": { unit: "day", count: 7 },
  "1d": { unit: "hour", count: 24 },
};

export function isTimeRange(v: string | undefined): v is TimeRange {
  return v === "31d" || v === "7d" || v === "1d";
}

export async function getPostTimeSeries(range: TimeRange): Promise<TimeBucket[]> {
  const { unit, count } = RANGES[range];
  // unit / interval は固定ホワイトリスト由来なので Prisma.raw で埋めて良い（ユーザー入力ではない）
  const unitLit = Prisma.raw(`'${unit}'`);
  const stepInterval = Prisma.raw(`interval '1 ${unit}'`);
  // 最古バケットの開始位置＝現在バケットから (count-1) 単位ぶん遡る
  const backInterval = Prisma.raw(`interval '${count - 1} ${unit}'`);
  // images の絞り込み（バケット範囲を確実に覆う余裕を持たせる）
  const filterInterval = Prisma.raw(`interval '${count + 1} ${unit}'`);

  const rows = await prisma.$queryRaw<
    {
      md: string;
      hh: string;
      ymd: string;
      posts: number;
      unsynced: number;
      ok: number;
      err: number;
    }[]
  >(Prisma.sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${unitLit}, (now() AT TIME ZONE 'Asia/Tokyo')) - ${backInterval},
        date_trunc(${unitLit}, (now() AT TIME ZONE 'Asia/Tokyo')),
        ${stepInterval}
      ) AS bucket
    ),
    imgs AS (
      SELECT
        -- created_at は timestamp without time zone（UTC値を保持）。JST 壁時計へは
        -- 「UTC とみなす→Tokyo へ変換」の二段変換が必要（単段だと -9h ずれる）。
        date_trunc(${unitLit}, ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')) AS bucket,
        (post_id IS NOT NULL AND is_disabled = false) AS favoritable,
        favorites_synced_at,
        post_status
      FROM images
      WHERE created_at >= now() - ${filterInterval}
    )
    SELECT
      to_char(b.bucket, 'MM/DD') AS md,
      to_char(b.bucket, 'HH24') AS hh,
      to_char(b.bucket, 'YYYY/MM/DD') AS ymd,
      count(i.bucket)::int AS posts,
      count(i.bucket) FILTER (
        WHERE i.favoritable AND i.favorites_synced_at IS NULL
      )::int AS unsynced,
      count(i.bucket) FILTER (
        WHERE i.favoritable AND i.favorites_synced_at IS NOT NULL AND i.post_status = 200
      )::int AS ok,
      count(i.bucket) FILTER (
        WHERE i.favoritable AND i.favorites_synced_at IS NOT NULL AND i.post_status IS DISTINCT FROM 200
      )::int AS err
    FROM buckets b
    LEFT JOIN imgs i ON i.bucket = b.bucket
    GROUP BY b.bucket
    ORDER BY b.bucket
  `);

  return rows.map((r) => ({
    label: unit === "hour" ? `${Number(r.hh)}時` : r.md,
    fullLabel: unit === "hour" ? `${r.ymd} ${r.hh}:00` : r.ymd,
    posts: r.posts,
    unsynced: r.unsynced,
    ok: r.ok,
    err: r.err,
  }));
}
