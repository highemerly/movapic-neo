/**
 * /admin/stats 用の集計ロジック（管理者のみが呼ぶ想定）。
 *
 * 3系統を独立取得する（1つが失敗しても他は表示できるよう、queue はページ側で握る）:
 *  - getFavoriteSyncStats(): お気に入り sync の健康状態（postStatus 分布・鮮度・backlog）
 *  - getQueueStats(): graphile-worker のジョブ状況（graphile_worker スキーマを直接クエリ）
 *  - getServiceStats(): サービス全体のざっくり統計（ユーザー数・投稿数・source 別 等）
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { FAVORITE_SYNC_WHERE } from "@/lib/fediverse/favoriteSyncQuery";

// ── お気に入り sync ──────────────────────────────────────────────
//
// 前提: DB は各画像につき「最後の同期の結果」（favorites_synced_at・post_status）しか
// 持たない（同期ごとの履歴テーブルは無い）。したがって統計は次の2系統に分けて出す:
//  - スナップショット（全期間）: 各投稿の"最新"ステータスの分布＝「今どういう状態か」
//  - アクティビティ窓（直近1h/24h）: その窓に投稿された数と、その窓に"最後に同期された"
//    画像数＋ステータス内訳。1画像は最新1回ぶんしか数えられない（＝同期回数ではなく
//    「その窓で最後に同期された画像のユニーク数」）点に注意。

/** ある時間窓での同期アクティビティ（post_status 内訳つき） */
export interface FavoriteWindowStats {
  /** この窓に「最後の同期」が記録された画像数（＝ok+rateLimited+…の横計） */
  synced: number;
  ok: number;
  rateLimited: number;
  clientError: number;
  serverError: number;
  connError: number;
}

/** サーバー（投稿者インスタンス）別の同期成否 */
export interface FavoriteServerRow {
  domain: string;
  type: string;
  /** そのサーバーの Fediverse 投稿（対象母数）数 */
  favoritable: number;
  /** 最新同期が成功（200） */
  ok: number;
  /** 一時失敗（429 / 5xx / 接続失敗=0。定期リトライ継続対象） */
  tempFail: number;
  /** 恒久失敗（429以外の4xx＝deleted/forbidden 等。定期リトライ停止対象） */
  clientFail: number;
  /** 一度も同期していない */
  neverSynced: number;
  /** そのサーバー内で最も新しい同期時刻 */
  lastSynced: Date | null;
}

export interface FavoriteSyncStats {
  /** sync 対象母数（Fediverse 投稿＝post_id あり・非表示でない・全期間） */
  favoritable: number;
  /** キャッシュ上の総お気に入り数（favorite_count の総和） */
  totalFavorites: number;
  /** フォールバック sync 待ち（periodic の対象条件に合致＝取りこぼし backlog） */
  backlog: number;

  // 全期間スナップショット（各投稿の最新ステータス分布）
  ok: number;
  neverSynced: number;
  rateLimited: number;
  clientError: number;
  serverError: number;
  connError: number;

  // アクティビティ窓
  window1h: FavoriteWindowStats;
  window24h: FavoriteWindowStats;

  // サーバー別（最終同期が新しい順）
  byServer: FavoriteServerRow[];
}

/** サーバー別集計の期間（favorites_synced_at で絞る。all は全期間＝絞らない） */
export type FavServerWindow = "all" | "1d" | "7d";

export async function getFavoriteSyncStats(
  serverWindow: FavServerWindow = "all"
): Promise<FavoriteSyncStats> {
  // post_id がある投稿だけが Fediverse の favourite を持ち得る（local は post_id なしで自然に除外）。
  // 全期間スナップショット（各投稿の最新ステータス）＋総数。
  const [snap] = await prisma.$queryRaw<
    {
      favoritable: number;
      never_synced: number;
      ok: number;
      rate_limited: number;
      client_error: number;
      server_error: number;
      conn_error: number;
      total_favorites: number;
    }[]
  >(Prisma.sql`
    SELECT
      count(*)::int AS favoritable,
      count(*) FILTER (WHERE favorites_synced_at IS NULL)::int AS never_synced,
      count(*) FILTER (WHERE post_status = 200)::int AS ok,
      count(*) FILTER (WHERE post_status = 429)::int AS rate_limited,
      count(*) FILTER (WHERE post_status >= 400 AND post_status < 500 AND post_status <> 429)::int AS client_error,
      count(*) FILTER (WHERE post_status >= 500 AND post_status < 600)::int AS server_error,
      count(*) FILTER (WHERE post_status = 0)::int AS conn_error,
      COALESCE(sum(favorite_count), 0)::int AS total_favorites
    FROM images
    WHERE post_id IS NOT NULL AND is_disabled = false
  `);

  // 時間窓アクティビティ（1h/24h）。synced/内訳=favorites_synced_at 窓。
  const [win] = await prisma.$queryRaw<
    {
      synced_1h: number;
      synced_24h: number;
      ok_1h: number;
      ok_24h: number;
      rl_1h: number;
      rl_24h: number;
      ce_1h: number;
      ce_24h: number;
      se_1h: number;
      se_24h: number;
      cc_1h: number;
      cc_24h: number;
    }[]
  >(Prisma.sql`
    WITH win AS (
      SELECT post_status,
        favorites_synced_at >= now() - interval '1 hour' AS s1,
        favorites_synced_at >= now() - interval '24 hours' AS s24
      FROM images
      WHERE post_id IS NOT NULL AND is_disabled = false
    )
    SELECT
      count(*) FILTER (WHERE s1)::int AS synced_1h,
      count(*) FILTER (WHERE s24)::int AS synced_24h,
      count(*) FILTER (WHERE s1 AND post_status = 200)::int AS ok_1h,
      count(*) FILTER (WHERE s24 AND post_status = 200)::int AS ok_24h,
      count(*) FILTER (WHERE s1 AND post_status = 429)::int AS rl_1h,
      count(*) FILTER (WHERE s24 AND post_status = 429)::int AS rl_24h,
      count(*) FILTER (WHERE s1 AND post_status >= 400 AND post_status < 500 AND post_status <> 429)::int AS ce_1h,
      count(*) FILTER (WHERE s24 AND post_status >= 400 AND post_status < 500 AND post_status <> 429)::int AS ce_24h,
      count(*) FILTER (WHERE s1 AND post_status >= 500 AND post_status < 600)::int AS se_1h,
      count(*) FILTER (WHERE s24 AND post_status >= 500 AND post_status < 600)::int AS se_24h,
      count(*) FILTER (WHERE s1 AND post_status = 0)::int AS cc_1h,
      count(*) FILTER (WHERE s24 AND post_status = 0)::int AS cc_24h
    FROM win
  `);

  // サーバー（投稿者インスタンス）別。同期先はオーナーのインスタンスなので domain 別に成否が出る。
  // 期間指定時は「その期間に最後の同期が記録された投稿」だけを対象にする（favorites_synced_at で絞る）。
  const serverWindowClause =
    serverWindow === "1d"
      ? Prisma.sql`AND i.favorites_synced_at >= now() - interval '1 day'`
      : serverWindow === "7d"
        ? Prisma.sql`AND i.favorites_synced_at >= now() - interval '7 days'`
        : Prisma.empty;
  const servers = await prisma.$queryRaw<
    {
      domain: string;
      type: string;
      favoritable: number;
      ok: number;
      temp_fail: number;
      client_fail: number;
      never_synced: number;
      last_synced: Date | null;
    }[]
  >(Prisma.sql`
    SELECT
      inst.domain,
      inst.type,
      count(*)::int AS favoritable,
      count(*) FILTER (WHERE i.post_status = 200)::int AS ok,
      count(*) FILTER (WHERE i.post_status = 429 OR (i.post_status >= 500 AND i.post_status < 600) OR i.post_status = 0)::int AS temp_fail,
      count(*) FILTER (WHERE i.post_status >= 400 AND i.post_status < 500 AND i.post_status <> 429)::int AS client_fail,
      count(*) FILTER (WHERE i.favorites_synced_at IS NULL)::int AS never_synced,
      max(i.favorites_synced_at) AS last_synced
    FROM images i
    JOIN users u ON u.id = i.user_id
    JOIN instances inst ON inst.id = u.instance_id
    WHERE i.post_id IS NOT NULL AND i.is_disabled = false ${serverWindowClause}
    GROUP BY inst.domain, inst.type
    ORDER BY last_synced DESC NULLS LAST
    LIMIT 30
  `);

  const [{ backlog }] = await prisma.$queryRaw<{ backlog: number }[]>(Prisma.sql`
    SELECT count(*)::int AS backlog FROM images WHERE ${FAVORITE_SYNC_WHERE}
  `);

  return {
    favoritable: snap.favoritable,
    totalFavorites: snap.total_favorites,
    backlog,
    ok: snap.ok,
    neverSynced: snap.never_synced,
    rateLimited: snap.rate_limited,
    clientError: snap.client_error,
    serverError: snap.server_error,
    connError: snap.conn_error,
    window1h: {
      synced: win.synced_1h,
      ok: win.ok_1h,
      rateLimited: win.rl_1h,
      clientError: win.ce_1h,
      serverError: win.se_1h,
      connError: win.cc_1h,
    },
    window24h: {
      synced: win.synced_24h,
      ok: win.ok_24h,
      rateLimited: win.rl_24h,
      clientError: win.ce_24h,
      serverError: win.se_24h,
      connError: win.cc_24h,
    },
    byServer: servers.map((s) => ({
      domain: s.domain,
      type: s.type,
      favoritable: s.favoritable,
      ok: s.ok,
      tempFail: s.temp_fail,
      clientFail: s.client_fail,
      neverSynced: s.never_synced,
      lastSynced: s.last_synced,
    })),
  };
}

// ── graphile-worker のジョブ状況 ─────────────────────────────────

export interface QueueTaskRow {
  taskIdentifier: string;
  total: number;
  /** locked_at が立っている＝現在実行中 */
  running: number;
  /** last_error があり、まだリトライ枠が残っている（再試行待ち） */
  retrying: number;
  /** attempts >= max_attempts で失敗確定（graphile-worker は消さず残す） */
  dead: number;
  /** 最も早い実行予定（next run） */
  nextRun: Date | null;
}

export interface QueueFailureRow {
  taskIdentifier: string;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  runAt: Date | null;
}

export interface QueueCrontabRow {
  identifier: string;
  lastExecution: Date | null;
}

export interface QueueStats {
  /** graphile_worker スキーマにアクセスできたか（worker 未起動 or 権限なしで false） */
  available: boolean;
  tasks: QueueTaskRow[];
  failures: QueueFailureRow[];
  crontabs: QueueCrontabRow[];
}

/**
 * graphile-worker のキュー状況を graphile_worker スキーマから直接読む。
 * スキーマは worker-front が初回接続時に migrate するため、まだ起動していない DB や
 * 権限のない接続では存在しない。その場合は available: false を返し画面側で握る。
 */
export async function getQueueStats(): Promise<QueueStats> {
  // スキーマ/ビューの存在を先に確認（無ければ以降のクエリで例外になるため）
  const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>(Prisma.sql`
    SELECT to_regclass('graphile_worker.jobs') IS NOT NULL AS exists
  `);
  if (!exists) {
    return { available: false, tasks: [], failures: [], crontabs: [] };
  }

  const tasks = await prisma.$queryRaw<
    {
      task_identifier: string;
      total: number;
      running: number;
      retrying: number;
      dead: number;
      next_run: Date | null;
    }[]
  >(Prisma.sql`
    SELECT
      task_identifier,
      count(*)::int AS total,
      count(*) FILTER (WHERE locked_at IS NOT NULL)::int AS running,
      count(*) FILTER (WHERE last_error IS NOT NULL AND attempts < max_attempts)::int AS retrying,
      count(*) FILTER (WHERE last_error IS NOT NULL AND attempts >= max_attempts)::int AS dead,
      min(run_at) AS next_run
    FROM graphile_worker.jobs
    GROUP BY task_identifier
    ORDER BY task_identifier
  `);

  const failures = await prisma.$queryRaw<
    {
      task_identifier: string;
      attempts: number;
      max_attempts: number;
      last_error: string;
      run_at: Date | null;
    }[]
  >(Prisma.sql`
    SELECT task_identifier, attempts, max_attempts, last_error, run_at
    FROM graphile_worker.jobs
    WHERE last_error IS NOT NULL
    ORDER BY run_at DESC
    LIMIT 20
  `);

  // 定期ジョブ（crontab）の最終実行時刻。known_crontabs は v0.16 に存在。
  let crontabs: QueueCrontabRow[] = [];
  try {
    const rows = await prisma.$queryRaw<
      { identifier: string; last_execution: Date | null }[]
    >(Prisma.sql`
      SELECT identifier, last_execution FROM graphile_worker.known_crontabs
      ORDER BY identifier
    `);
    crontabs = rows.map((r) => ({
      identifier: r.identifier,
      lastExecution: r.last_execution,
    }));
  } catch {
    // known_crontabs が無いバージョン差異は握る（tasks/failures は返せる）
    crontabs = [];
  }

  return {
    available: true,
    tasks: tasks.map((t) => ({
      taskIdentifier: t.task_identifier,
      total: t.total,
      running: t.running,
      retrying: t.retrying,
      dead: t.dead,
      nextRun: t.next_run,
    })),
    failures: failures.map((f) => ({
      taskIdentifier: f.task_identifier,
      attempts: f.attempts,
      maxAttempts: f.max_attempts,
      lastError: f.last_error,
      runAt: f.run_at,
    })),
    crontabs,
  };
}

// ── サービス全体統計 ─────────────────────────────────────────────

export interface ServiceStats {
  userCount: number;
  imageCount: number;
  /** 公開TL に出る投稿（is_public = true） */
  publicCount: number;
  openReports: number;
  disabledImages: number;
  last24h: number;
  last7d: number;
  /** source 別の投稿数（web / email / mention） */
  bySource: { source: string; count: number }[];
  /** 連携インスタンス総数 */
  instanceCount: number;
  /** サーバー別の集計（ユーザー数の多い順・上位20件） */
  byInstance: InstanceRow[];
  /** 上位20件から漏れたサーバー数 */
  otherInstances: number;
  /** 上位20件から漏れたサーバーの合計（各指標） */
  other: Omit<InstanceRow, "domain" | "type">;
}

export interface InstanceRow {
  domain: string;
  type: string;
  /** そのサーバーの登録ユーザー数 */
  users: number;
  /** そのサーバーのユーザーによる総投稿数 */
  posts: number;
  /** 直近7日の投稿数 */
  posts7d: number;
  /** 直近7日の新規登録ユーザー数 */
  newUsers7d: number;
}

/** サービス全体のサーバー別ユーザー数を上位に絞る件数 */
const INSTANCE_TOP = 20;

export async function getServiceStats(): Promise<ServiceStats> {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    userCount,
    imageCount,
    publicCount,
    openReports,
    disabledImages,
    last24h,
    last7d,
    bySourceRaw,
    instanceRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.image.count(),
    prisma.image.count({ where: { isPublic: true } }),
    prisma.report.count({ where: { status: "open" } }),
    prisma.image.count({ where: { isDisabled: true } }),
    prisma.image.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.image.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.image.groupBy({ by: ["source"], _count: { _all: true } }),
    // サーバー別の集計（ユーザー数の多い順・全件取得して上位を切り出す）。
    // images は LEFT JOIN（投稿0のユーザーも数えるため）。ユーザー数は行の膨張を避けて
    // count(DISTINCT u.id)、投稿数は count(i.id) で数える。
    prisma.$queryRaw<
      {
        domain: string;
        type: string;
        users: number;
        posts: number;
        posts_7d: number;
        new_users_7d: number;
      }[]
    >(Prisma.sql`
      SELECT
        inst.domain,
        inst.type,
        count(DISTINCT u.id)::int AS users,
        count(DISTINCT u.id) FILTER (WHERE u.created_at >= now() - interval '7 days')::int AS new_users_7d,
        count(i.id)::int AS posts,
        count(i.id) FILTER (WHERE i.created_at >= now() - interval '7 days')::int AS posts_7d
      FROM instances inst
      JOIN users u ON u.instance_id = inst.id
      LEFT JOIN images i ON i.user_id = u.id
      GROUP BY inst.domain, inst.type
      ORDER BY users DESC, inst.domain ASC
    `),
  ]);

  const bySource = bySourceRaw
    .map((r) => ({ source: r.source, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  const normalized: InstanceRow[] = instanceRows.map((r) => ({
    domain: r.domain,
    type: r.type,
    users: r.users,
    posts: r.posts,
    posts7d: r.posts_7d,
    newUsers7d: r.new_users_7d,
  }));
  const byInstance = normalized.slice(0, INSTANCE_TOP);
  const rest = normalized.slice(INSTANCE_TOP);

  return {
    userCount,
    imageCount,
    publicCount,
    openReports,
    disabledImages,
    last24h,
    last7d,
    bySource,
    instanceCount: normalized.length,
    byInstance,
    otherInstances: rest.length,
    other: {
      users: rest.reduce((sum, r) => sum + r.users, 0),
      posts: rest.reduce((sum, r) => sum + r.posts, 0),
      posts7d: rest.reduce((sum, r) => sum + r.posts7d, 0),
      newUsers7d: rest.reduce((sum, r) => sum + r.newUsers7d, 0),
    },
  };
}
