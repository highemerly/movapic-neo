/**
 * /admin/stats のコンポーネント・ヘルスチェック。
 *
 * 各tier（web / データベース / compute / worker-front＋Bot Streaming）が正しく
 * 動いているかを、web pod（/admin/stats を描画する側）から確認する読み取り専用の集計。
 *
 * pod間到達の考え方:
 *  - web（自分自身）: 描画できている時点で稼働。version/role を出すだけ。
 *  - データベース: `SELECT 1` の往復で疎通と遅延を測る。
 *  - compute: `COMPUTE_SERVICE_URL/api/health` を叩く（画像生成専用の内部サービス）。
 *  - worker-front / Bot Streaming: 状態は worker-front プロセスの globalThis にあり web からは
 *    直接読めないため `WORKER_FRONT_INTERNAL_URL/api/health/stream`（ClusterIP）を叩く。
 *
 * dev の all-in-one（COMPONENT_ROLE 未設定）は compute も streaming も同一プロセスなので、
 * HTTP を張らず in-process 参照で確認する（＝ローカルでもそのまま動く）。
 *
 * 本番の web deployment（外部 K8S_REPO 管理）に WORKER_FRONT_INTERNAL_URL /
 * COMPUTE_SERVICE_URL が未設定でも壊れず、「確認できません（unknown）」として表示する。
 */

import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { USER_AGENT } from "@/lib/userAgent";
import { getMentionStreamHealth, STREAM_STALE_MS } from "@/lib/mention/streamStatus";
import { runtimeVersions } from "@/lib/version";

/** ok=正常 / warn=稼働だが注意 / down=異常 / unknown=確認不可（未設定・非対象） */
export type HealthState = "ok" | "warn" | "down" | "unknown";

export interface HealthMeta {
  label: string;
  value: string;
}

export interface ComponentHealth {
  key: string;
  label: string;
  state: HealthState;
  /** 一行サマリ */
  summary: string;
  /** 補足の key-value（詳細行） */
  meta: HealthMeta[];
}

const role = process.env.COMPONENT_ROLE || "";
const isAllInOne = role === "";

/** 経過ミリ秒を人間可読（秒/分/時間/日）に整形。 */
function fmtAge(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

/** GET で JSON を取りに行く。到達不可/タイムアウト/非JSONは null。 */
async function fetchJson(
  url: string,
  timeoutMs = 3000
): Promise<{ ok: boolean; status: number; body: unknown } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch {
    return null;
  }
}

/** ソフトウェアバージョン行（version / Next.js / Node.js）を in-process から組み立てる。 */
function localVersionMeta(): HealthMeta[] {
  const v = runtimeVersions();
  return [
    { label: "version", value: v.app },
    { label: "Next.js", value: v.next },
    { label: "Node.js", value: v.node },
  ];
}

/** アプリバージョン行のみ（compute/worker-front 用。Next.js/Node.js は出さない）。 */
function localAppVersionMeta(): HealthMeta[] {
  return [{ label: "version", value: runtimeVersions().app }];
}

/** HTTP レスポンスからアプリバージョン行のみ抽出（compute/worker-front 用）。 */
function appVersionMetaFrom(body: unknown): HealthMeta[] {
  return versionMetaFrom(body).filter((m) => m.label === "version");
}

/** /api/health(/stream) レスポンスの versions からバージョン行を組み立てる。 */
function versionMetaFrom(body: unknown): HealthMeta[] {
  if (!body || typeof body !== "object") return [];
  const v = (body as { versions?: unknown }).versions;
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  const meta: HealthMeta[] = [];
  if (typeof o.app === "string") meta.push({ label: "version", value: o.app });
  if (typeof o.next === "string") meta.push({ label: "Next.js", value: o.next });
  if (typeof o.node === "string") meta.push({ label: "Node.js", value: o.node });
  return meta;
}

/** web（自分自身）。描画できている時点で稼働。 */
function checkWeb(): ComponentHealth {
  return {
    key: "web",
    label: "web",
    state: "ok",
    summary: "稼働中",
    meta: [{ label: "role", value: role || "all-in-one" }, ...localVersionMeta()],
  };
}

/** データベース疎通（往復遅延）＋ バージョン・データ量・接続数。 */
async function checkDb(): Promise<ComponentHealth> {
  const startedAt = Date.now();
  try {
    // 疎通確認を兼ねてサーバー情報を1往復で取得
    const rows = await prisma.$queryRaw<
      Array<{ version: string; size: string; conns: number }>
    >(Prisma.sql`
      SELECT
        current_setting('server_version') AS version,
        pg_size_pretty(pg_database_size(current_database())) AS size,
        (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS conns
    `);
    const ms = Date.now() - startedAt;
    const r = rows[0];
    // "15.17 (Debian ...)" → "15.17"
    const pgVersion = (r?.version ?? "?").split(" ")[0];
    return {
      key: "db",
      label: "postgres",
      state: ms > 1000 ? "warn" : "ok",
      summary: `稼働中 (遅延: ${ms}ms)`,
      meta: [
        { label: "version", value: pgVersion },
        { label: "データ量", value: r?.size ?? "—" },
        { label: "接続数", value: r ? String(r.conns) : "—" },
      ],
    };
  } catch (e) {
    return {
      key: "db",
      label: "データベース",
      state: "down",
      summary: "接続に失敗しました",
      meta: [{ label: "error", value: e instanceof Error ? e.message : String(e) }],
    };
  }
}

/**
 * sharp / libvips のバージョンを取得。all-in-one では in-process で読む。
 * sharp は compute（と all-in-one）だけが積むため lazy import で非画像 pod に載せない。
 */
async function getSharpVersions(): Promise<{ sharp: string; vips: string } | null> {
  try {
    const sharp = (await import("sharp")).default;
    return { sharp: sharp.versions.sharp, vips: sharp.versions.vips };
  } catch {
    return null;
  }
}

/** /api/health レスポンスから sharp / libvips バージョン行を組み立てる。 */
function sharpMetaFrom(body: unknown): HealthMeta[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const meta: HealthMeta[] = [];
  if (typeof b.sharp === "string") meta.push({ label: "sharp", value: b.sharp });
  if (typeof b.vips === "string") meta.push({ label: "libvips", value: b.vips });
  return meta;
}

/** compute（画像生成専用サービス）の /api/health。 */
async function checkCompute(): Promise<ComponentHealth> {
  const base = process.env.COMPUTE_SERVICE_URL?.replace(/\/+$/, "");

  // all-in-one は同一プロセスで sharp/skia を持つ（compute サービス無し）。
  // ステータス表記は web と揃え、sharp/libvips のバージョンだけ添える。
  if (isAllInOne) {
    const sv = await getSharpVersions();
    return {
      key: "compute",
      label: "compute",
      state: "ok",
      summary: "稼働中",
      meta: [
        ...localAppVersionMeta(),
        ...(sv
          ? [
              { label: "sharp", value: sv.sharp },
              { label: "libvips", value: sv.vips },
            ]
          : []),
      ],
    };
  }
  if (!base) {
    return {
      key: "compute",
      label: "compute",
      state: "unknown",
      summary: "COMPUTE_SERVICE_URL 未設定で確認できません",
      meta: [],
    };
  }

  const r = await fetchJson(`${base}/api/health`);
  if (!r) {
    return {
      key: "compute",
      label: "compute",
      state: "down",
      summary: "応答なし（到達不可 or タイムアウト）",
      meta: [{ label: "接続先", value: base }],
    };
  }
  if (!r.ok) {
    return {
      key: "compute",
      label: "compute",
      state: "down",
      summary: `異常応答 HTTP ${r.status}`,
      meta: [{ label: "接続先", value: base }],
    };
  }
  const computeRole =
    r.body && typeof r.body === "object" && "role" in r.body
      ? String((r.body as { role: unknown }).role)
      : "?";
  return {
    key: "compute",
    label: "compute",
    state: "ok",
    summary: "稼働中",
    meta: [
      { label: "role", value: computeRole },
      ...appVersionMetaFrom(r.body),
      ...sharpMetaFrom(r.body),
    ],
  };
}

/**
 * Graphile Worker のキュー状況（待ち / 実行中 / 失敗）を DB から直接取得。
 * 完了ジョブは削除されるため、jobs に残る行がおおむね未処理分。
 * スキーマ未作成（worker 未起動）なら null。
 */
async function getQueueStats(): Promise<{
  ready: number;
  running: number;
  failed: number;
} | null> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ ready: number; running: number; failed: number }>
    >(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE locked_at IS NULL AND run_at <= now())::int AS ready,
        count(*) FILTER (WHERE locked_at IS NOT NULL)::int AS running,
        count(*) FILTER (WHERE last_error IS NOT NULL)::int AS failed
      FROM graphile_worker.jobs
    `);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * worker-front（キュー consumer＋Bot受信）と Bot Streaming を確認して2枚のカードを返す。
 * 1回の取得（in-process or /api/health/stream）から両方を導く。
 */
async function checkWorkerAndStream(): Promise<ComponentHealth[]> {
  // キュー状況は DB 直読みなので worker への到達性と独立に取れる（並行実行）
  const queuePromise = getQueueStats();

  // streaming の取得（in-process / HTTP）は streamStatus に集約。ここでは取得結果から
  // worker-front と Bot Streaming の2カードを組み立てる。
  // reachable: true=応答あり / false=到達不可 / null=確認不可（URL未設定）
  const acq = await getMentionStreamHealth();
  const { health, reachable, note } = acq;
  // バージョン行の元ネタ。分離構成は /api/health/stream の body、all-in-one は in-process。
  const versionMeta: HealthMeta[] = acq.inProcess
    ? localAppVersionMeta()
    : appVersionMetaFrom(acq.body);

  // --- worker-front プロセス自体の生死 ---
  // 待ちジョブは worker 停止中でも意味がある（積み上がりの検知）ので到達性と無関係に表示
  const queue = await queuePromise;
  const worker: ComponentHealth = {
    key: "worker-front",
    label: "worker-front",
    state: reachable === true ? "ok" : reachable === false ? "down" : "unknown",
    summary:
      reachable === true
        ? isAllInOne
          ? "all-in-one（同一プロセス）"
          : "稼働中"
        : reachable === false
          ? note
          : note,
    meta: [
      ...versionMeta,
      ...(queue
        ? [
            { label: "待ちジョブ", value: String(queue.ready) },
            { label: "実行中", value: String(queue.running) },
            ...(queue.failed > 0
              ? [{ label: "失敗(リトライ待ち)", value: String(queue.failed) }]
              : []),
          ]
        : []),
    ],
  };

  // --- Bot Streaming（メンション受信 WebSocket） ---
  let stream: ComponentHealth;
  if (!health) {
    stream = {
      key: "stream",
      label: "Streaming（Bot）",
      state: "unknown",
      summary: note || "状態を取得できません",
      meta: [],
    };
  } else {
    let state: HealthState;
    let summary: string;
    if (health.connected) {
      const stale = health.lastEventAgeMs != null && health.lastEventAgeMs > STREAM_STALE_MS;
      state = stale ? "warn" : "ok";
      summary = stale
        ? `接続中だが受信が停滞（最終受信 ${fmtAge(health.lastEventAgeMs)}）`
        : "接続中";
    } else if (health.started) {
      state = "down";
      summary = `切断中（再接続を試行中・${health.reconnectAttempts}回）`;
    } else {
      state = "warn";
      summary = "未起動（BOTトークン未設定の可能性）";
    }
    stream = {
      key: "stream",
      label: "bot streaming（メンション受信）",
      state,
      summary,
      meta: [
        { label: "接続先", value: health.streamingHost ?? "—" },
        { label: "稼働時間", value: fmtAge(health.uptimeMs) },
        { label: "最終受信", value: fmtAge(health.lastEventAgeMs) },
        { label: "最終メンション", value: fmtAge(health.lastMentionAgeMs) },
        { label: "受信数", value: health.mentionCount.toLocaleString("ja-JP") },
        { label: "再接続試行", value: String(health.reconnectAttempts) },
        { label: "直近closeコード", value: health.lastCloseCode == null ? "—" : String(health.lastCloseCode) },
      ],
    };
  }

  return [worker, stream];
}

/** 全コンポーネントのヘルスを並列取得して返す（表示順）。 */
export async function getComponentHealth(): Promise<ComponentHealth[]> {
  const [db, compute, workerAndStream] = await Promise.all([
    checkDb(),
    checkCompute(),
    checkWorkerAndStream(),
  ]);
  return [checkWeb(), db, compute, ...workerAndStream];
}
