/**
 * /admin/favorites のお気に入り同期状況。
 *
 * DB は各画像につき「最後の同期の結果」（favorites_synced_at・post_status）しか持たない。
 * したがって集計を用途で2系統に分ける（母数の基準が別）:
 *   - 「期間中に投稿したもの」: created_at 基準。favoritable を未同期＋ステータス別に分割（円グラフ）。
 *   - 「期間中に同期したもの」: favorites_synced_at 基準。ステータス別に分割（円グラフ）。
 * サマリ（母数/未同期/総fav/backlog）は期間に依存しない全期間スナップショット。
 *
 * ステータス分類は 200/403/404/429/Other 4xx/5xx/接続失敗/その他 の8種＋未同期。
 * 「その他」は補集合（同期済みだが上記いずれにも該当しない＝NULL/3xx 等）で、分割を漏れなくする。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { FAVORITE_SYNC_WHERE } from "@/lib/fediverse/favoriteSyncQuery";
import { PAGE_SIZE } from "@/app/admin/_components/query";
import { periodRange, type Period } from "./periods";

/** post_status のステータス別内訳（同期済み行のみ） */
export interface StatusBreakdown {
  ok: number; // 200
  forbidden: number; // 403
  notFound: number; // 404
  rateLimited: number; // 429
  otherClient: number; // 上記以外の 4xx
  serverError: number; // 5xx
  connError: number; // 0（接続失敗）
  other: number; // 同期済みだが上記いずれでもない（NULL/3xx 等・補集合）
}

/** 同期済み行に対する post_status 別 count の FILTER 群を生成（guard は追加の絞り込み条件） */
function statusFilters(guard: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    count(*) FILTER (WHERE ${guard} AND post_status = 200)::int AS ok,
    count(*) FILTER (WHERE ${guard} AND post_status = 403)::int AS forbidden,
    count(*) FILTER (WHERE ${guard} AND post_status = 404)::int AS not_found,
    count(*) FILTER (WHERE ${guard} AND post_status = 429)::int AS rate_limited,
    count(*) FILTER (WHERE ${guard} AND post_status >= 400 AND post_status < 500 AND post_status NOT IN (403, 404, 429))::int AS other_client,
    count(*) FILTER (WHERE ${guard} AND post_status >= 500 AND post_status < 600)::int AS server_error,
    count(*) FILTER (WHERE ${guard} AND post_status = 0)::int AS conn_error,
    count(*) FILTER (WHERE ${guard} AND (
      post_status IS NULL OR post_status < 0 OR post_status >= 600
      OR (post_status > 0 AND post_status < 400 AND post_status <> 200)
    ))::int AS other
  `;
}

interface StatusRow {
  ok: number;
  forbidden: number;
  not_found: number;
  rate_limited: number;
  other_client: number;
  server_error: number;
  conn_error: number;
  other: number;
}

function toBreakdown(r: StatusRow): StatusBreakdown {
  return {
    ok: r.ok,
    forbidden: r.forbidden,
    notFound: r.not_found,
    rateLimited: r.rate_limited,
    otherClient: r.other_client,
    serverError: r.server_error,
    connError: r.conn_error,
    other: r.other,
  };
}

/** 全期間スナップショット（母数・現状分布） */
export interface FavSummary {
  favoritable: number;
  neverSynced: number;
  totalFavorites: number;
  backlog: number;
  /** 全期間で直近200だった割合(%) */
  successRate: number;
}

/** 「期間中に投稿したもの」（created_at 基準・未同期＋ステータス別） */
export interface PostedInWindow extends StatusBreakdown {
  favoritable: number;
  unsynced: number;
}

/** 「期間中に同期したもの」（favorites_synced_at 基準・ステータス別） */
export interface SyncedInWindow extends StatusBreakdown {
  synced: number;
}

/** サーバー（投稿者インスタンス）別 */
export interface FavServerRow extends StatusBreakdown {
  domain: string;
  type: string;
  favoritable: number;
  neverSynced: number;
  lastSynced: Date | null;
}

/** 全サーバー合算（「すべて」行用・ページに依存しない全件合算） */
export type FavServerTotals = Omit<FavServerRow, "domain" | "type">;

/** エラーになった投稿のサンプル（投稿詳細へ飛ぶ導線用） */
export interface FavErrorSample {
  id: string;
  overlayText: string;
  username: string;
  domain: string;
  instanceType: string;
  postStatus: number | null;
  syncedAt: Date | null;
}

export interface FavoritesData {
  period: Period;
  /** 円グラフを絞り込んでいる投稿者インスタンス（null=全体） */
  server: string | null;
  summary: FavSummary;
  posted: PostedInWindow;
  synced: SyncedInWindow;
  /** サーバー別（表示ページぶんのみ） */
  byServer: FavServerRow[];
  /** 全サーバー合算（ページ非依存・「すべて」行用） */
  serverTotals: FavServerTotals;
  /** サーバー総数（ページネーション用） */
  serverCount: number;
  serverPage: number;
  serverTotalPages: number;
  errorSamples: FavErrorSample[];
}

const FAVORITABLE = Prisma.sql`post_id IS NOT NULL AND is_disabled = false`;
const SYNCED = Prisma.sql`favorites_synced_at IS NOT NULL`;

export async function getFavoritesData(
  period: Period,
  server: string | null = null,
  serverPage: number = 1
): Promise<FavoritesData> {
  // 期間は絶対レンジ [from, to)（all は null＝絞らない）。timestamp(UTC保持) は
  // (col AT TIME ZONE 'UTC') で instant 化してから比較（セッションTZ非依存）。
  const range = periodRange(period, new Date());
  // 円グラフ（posted/synced）とエラーサンプルだけ server で絞る。summary は期間のみ（server非依存）、
  // byServer は全サーバーの一覧なので期間のみで絞る。
  const serverClause = server
    ? Prisma.sql`AND user_id IN (SELECT u.id FROM users u JOIN instances inst ON inst.id = u.instance_id WHERE inst.domain = ${server})`
    : Prisma.empty;
  // 期間のみ（server 非依存）の投稿基準 WHERE。サマリはこれを使う。
  const postedWhereBase = range
    ? Prisma.sql`${FAVORITABLE} AND (created_at AT TIME ZONE 'UTC') >= ${range.from} AND (created_at AT TIME ZONE 'UTC') < ${range.to}`
    : Prisma.sql`${FAVORITABLE}`;
  const postedWhere = Prisma.sql`${postedWhereBase} ${serverClause}`;
  const syncedWhereBase = range
    ? Prisma.sql`${FAVORITABLE} AND (favorites_synced_at AT TIME ZONE 'UTC') >= ${range.from} AND (favorites_synced_at AT TIME ZONE 'UTC') < ${range.to}`
    : Prisma.sql`${FAVORITABLE} AND ${SYNCED}`;
  const syncedWhere = Prisma.sql`${syncedWhereBase} ${serverClause}`;
  // サーバー別: all は全 favoritable（未同期列を出す）、期間指定は「その期間に最後の同期」のみ
  const serverWindowClause = range
    ? Prisma.sql`AND (i.favorites_synced_at AT TIME ZONE 'UTC') >= ${range.from} AND (i.favorites_synced_at AT TIME ZONE 'UTC') < ${range.to}`
    : Prisma.empty;
  const [summaryRows, postedRows, syncedRows, backlogRows, servers, serverCountRows, totalsRows, samples] =
    await Promise.all([
    prisma.$queryRaw<
      {
        favoritable: number;
        never_synced: number;
        ok: number;
        total_favorites: number;
      }[]
    >(Prisma.sql`
      SELECT
        count(*)::int AS favoritable,
        count(*) FILTER (WHERE favorites_synced_at IS NULL)::int AS never_synced,
        count(*) FILTER (WHERE post_status = 200)::int AS ok,
        COALESCE(sum(favorite_count), 0)::int AS total_favorites
      FROM images WHERE ${postedWhereBase}
    `),
    // 表①: 投稿基準。未同期＋（同期済みの）ステータス別。合計 = favoritable。
    prisma.$queryRaw<({ favoritable: number; unsynced: number } & StatusRow)[]>(Prisma.sql`
      SELECT
        count(*)::int AS favoritable,
        count(*) FILTER (WHERE favorites_synced_at IS NULL)::int AS unsynced,
        ${statusFilters(SYNCED)}
      FROM images WHERE ${postedWhere}
    `),
    // 表②: 同期基準。ステータス別。合計 = synced。
    prisma.$queryRaw<({ synced: number } & StatusRow)[]>(Prisma.sql`
      SELECT
        count(*)::int AS synced,
        ${statusFilters(Prisma.sql`true`)}
      FROM images WHERE ${syncedWhere}
    `),
    prisma.$queryRaw<{ backlog: number }[]>(Prisma.sql`
      SELECT count(*)::int AS backlog FROM images WHERE ${FAVORITE_SYNC_WHERE}
    `),
    prisma.$queryRaw<
      ({
        domain: string;
        type: string;
        favoritable: number;
        never_synced: number;
        last_synced: Date | null;
      } & StatusRow)[]
    >(Prisma.sql`
      SELECT
        inst.domain,
        inst.type,
        count(*)::int AS favoritable,
        count(*) FILTER (WHERE i.favorites_synced_at IS NULL)::int AS never_synced,
        max(i.favorites_synced_at) AS last_synced,
        ${statusFilters(Prisma.sql`i.favorites_synced_at IS NOT NULL`)}
      FROM images i
      JOIN users u ON u.id = i.user_id
      JOIN instances inst ON inst.id = u.instance_id
      WHERE i.post_id IS NOT NULL AND i.is_disabled = false ${serverWindowClause}
      GROUP BY inst.domain, inst.type
      ORDER BY last_synced DESC NULLS LAST, inst.domain ASC
      LIMIT ${PAGE_SIZE} OFFSET ${(serverPage - 1) * PAGE_SIZE}
    `),
    // サーバー総数（ページネーション用）＝ byServer の GROUP を数える。
    prisma.$queryRaw<{ c: number }[]>(Prisma.sql`
      SELECT count(*)::int AS c FROM (
        SELECT 1
        FROM images i
        JOIN users u ON u.id = i.user_id
        JOIN instances inst ON inst.id = u.instance_id
        WHERE i.post_id IS NOT NULL AND i.is_disabled = false ${serverWindowClause}
        GROUP BY inst.domain, inst.type
      ) t
    `),
    // 「すべて」行＝全サーバー合算（ページ非依存・グループ化なし・server 非依存）。
    prisma.$queryRaw<
      ({ favoritable: number; never_synced: number; last_synced: Date | null } & StatusRow)[]
    >(Prisma.sql`
      SELECT
        count(*)::int AS favoritable,
        count(*) FILTER (WHERE i.favorites_synced_at IS NULL)::int AS never_synced,
        max(i.favorites_synced_at) AS last_synced,
        ${statusFilters(Prisma.sql`i.favorites_synced_at IS NOT NULL`)}
      FROM images i
      JOIN users u ON u.id = i.user_id
      JOIN instances inst ON inst.id = u.instance_id
      WHERE i.post_id IS NOT NULL AND i.is_disabled = false ${serverWindowClause}
    `),
    // エラー投稿サンプル（同期済みで post_status ≠ 200）。期間 / server で絞り、投稿詳細へ飛ぶ導線用。
    prisma.image.findMany({
      where: {
        postId: { not: null },
        isDisabled: false,
        postStatus: { not: 200 },
        favoritesSyncedAt: range ? { gte: range.from, lt: range.to } : { not: null },
        ...(server ? { user: { instance: { domain: server } } } : {}),
      },
      orderBy: { favoritesSyncedAt: "desc" },
      take: 12,
      select: {
        id: true,
        overlayText: true,
        postStatus: true,
        favoritesSyncedAt: true,
        user: {
          select: { username: true, instance: { select: { domain: true, type: true } } },
        },
      },
    }),
  ]);

  const s = summaryRows[0];
  const summary: FavSummary = {
    favoritable: s.favoritable,
    neverSynced: s.never_synced,
    totalFavorites: s.total_favorites,
    backlog: backlogRows[0]?.backlog ?? 0,
    successRate: s.favoritable ? Math.round((s.ok / s.favoritable) * 100) : 0,
  };

  const p = postedRows[0];
  const y = syncedRows[0];
  const t = totalsRows[0];
  const serverCount = serverCountRows[0]?.c ?? 0;

  return {
    period,
    server,
    summary,
    posted: { favoritable: p.favoritable, unsynced: p.unsynced, ...toBreakdown(p) },
    synced: { synced: y.synced, ...toBreakdown(y) },
    byServer: servers.map((r) => ({
      domain: r.domain,
      type: r.type,
      favoritable: r.favoritable,
      neverSynced: r.never_synced,
      lastSynced: r.last_synced,
      ...toBreakdown(r),
    })),
    serverTotals: {
      favoritable: t.favoritable,
      neverSynced: t.never_synced,
      lastSynced: t.last_synced,
      ...toBreakdown(t),
    },
    serverCount,
    serverPage,
    serverTotalPages: Math.max(1, Math.ceil(serverCount / PAGE_SIZE)),
    errorSamples: samples.map((r) => ({
      id: r.id,
      overlayText: r.overlayText,
      username: r.user.username,
      domain: r.user.instance.domain,
      instanceType: r.user.instance.type,
      postStatus: r.postStatus,
      syncedAt: r.favoritesSyncedAt,
    })),
  };
}
