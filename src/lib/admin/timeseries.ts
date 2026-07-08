/**
 * /admin/stats のグラフ用時系列。JST バケットで投稿数（線）＋ お気に入り同期状態（棒）を集計する。
 *
 * 粒度は期間で決まる: 全期間=月次 / 直近72時間まで=時次 / それ以外=日次。
 * バケットは JST 壁時計に整列（date_trunc）。生成範囲は periods.ts の [from, to) に一致させる
 * （all は DB の最古〜現在）。to は排他終端なので最終バケットは to の直前が入る側で切る。
 *
 * fav 同期状態の3分類は「補集合」で定義し、favoritable な投稿を漏れなく分割する:
 *   - 未同期  : favorites_synced_at IS NULL
 *   - 直近200 : favorites_synced_at IS NOT NULL AND post_status = 200
 *   - エラー  : favorites_synced_at IS NOT NULL AND post_status <> 200（NULL/3xx も含む＝補集合）
 * local 投稿（post_id なし）は fav 対象外なので棒の積み上げ合計 ≤ 線（総投稿数）になる。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { periodRange, type Period } from "./periods";

type Unit = "month" | "day" | "hour";

export interface TimeBucket {
  /** 軸ラベル（month=YYYY/MM, day=MM/DD, hour=HH時） */
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

function unitForPeriod(p: Period): Unit {
  if (p === "all") return "month";
  // 1日以内の窓は時次（昨日は24本の時間帯別に）。72時間までも時次。
  if (p === "1h" || p === "24h" || p === "72h" || p === "yesterday") return "hour";
  return "day";
}

interface Row {
  yyyy: string;
  mm: string;
  dd: string;
  hh: string;
  posts: number;
  unsynced: number;
  ok: number;
  err: number;
}

export async function getPostTimeSeries(period: Period): Promise<TimeBucket[]> {
  const unit = unitForPeriod(period);
  const range = periodRange(period, new Date());
  // unit は固定ホワイトリスト由来なので Prisma.raw で埋めて良い（ユーザー入力ではない）
  const unitLit = Prisma.raw(`'${unit}'`);
  const step = Prisma.raw(`interval '1 ${unit}'`);

  // created_at は timestamp without time zone（UTC値を保持）。JST 壁時計へは
  // 「UTC とみなす→Tokyo へ変換」の二段変換が必要（単段だと -9h ずれる）。
  const createdJst = Prisma.raw(
    `((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')`
  );

  // 生成範囲の開始・終了バケットと、投稿の絞り込み。
  // all は DB 最古〜現在、それ以外は [from, to)。to は排他なので直前(-1μs)のバケットで切る。
  const startBucket = range
    ? Prisma.sql`date_trunc(${unitLit}, (${range.from}::timestamptz AT TIME ZONE 'Asia/Tokyo'))`
    : Prisma.sql`date_trunc(${unitLit}, (SELECT (min(created_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo' FROM images))`;
  const endBucket = range
    ? Prisma.sql`date_trunc(${unitLit}, ((${range.to}::timestamptz - interval '1 microsecond') AT TIME ZONE 'Asia/Tokyo'))`
    : Prisma.sql`date_trunc(${unitLit}, (now() AT TIME ZONE 'Asia/Tokyo'))`;
  const imgFilter = range
    ? Prisma.sql`(created_at AT TIME ZONE 'UTC') >= ${range.from} AND (created_at AT TIME ZONE 'UTC') < ${range.to}`
    : Prisma.sql`true`;

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH buckets AS (
      SELECT generate_series(${startBucket}, ${endBucket}, ${step}) AS bucket
    ),
    imgs AS (
      SELECT
        date_trunc(${unitLit}, ${createdJst}) AS bucket,
        (post_id IS NOT NULL AND is_disabled = false) AS favoritable,
        favorites_synced_at,
        post_status
      FROM images
      WHERE ${imgFilter}
    )
    SELECT
      to_char(b.bucket, 'YYYY') AS yyyy,
      to_char(b.bucket, 'MM') AS mm,
      to_char(b.bucket, 'DD') AS dd,
      to_char(b.bucket, 'HH24') AS hh,
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
    label:
      unit === "hour"
        ? `${Number(r.hh)}時`
        : unit === "month"
          ? `${r.yyyy}/${r.mm}`
          : `${r.mm}/${r.dd}`,
    fullLabel:
      unit === "hour"
        ? `${r.yyyy}/${r.mm}/${r.dd} ${r.hh}:00`
        : unit === "month"
          ? `${r.yyyy}年${r.mm}月`
          : `${r.yyyy}/${r.mm}/${r.dd}`,
    posts: r.posts,
    unsynced: r.unsynced,
    ok: r.ok,
    err: r.err,
  }));
}
