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
import type { MentionStreamHealth } from "@/lib/mention/streamer";
import pkg from "../../../package.json";

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
/** streaming の受信停滞をどれだけ許容するか（超過で warn）。heartbeat 込みで通常 ~30s 間隔。 */
const STREAM_STALE_MS = 3 * 60_000;

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

/** web（自分自身）。描画できている時点で稼働。 */
function checkWeb(): ComponentHealth {
  return {
    key: "web",
    label: "Web（このpod）",
    state: "ok",
    summary: "稼働中",
    meta: [
      { label: "role", value: role || "all-in-one" },
      { label: "version", value: pkg.version },
      { label: "Node.js", value: process.version.replace(/^v/, "") },
    ],
  };
}

/** データベース疎通（SELECT 1 の往復遅延）。 */
async function checkDb(): Promise<ComponentHealth> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    const ms = Date.now() - startedAt;
    return {
      key: "db",
      label: "データベース",
      state: ms > 1000 ? "warn" : "ok",
      summary: `疎通OK (${ms}ms)`,
      meta: [{ label: "応答", value: `${ms}ms` }],
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

/** compute（画像生成専用サービス）の /api/health。 */
async function checkCompute(): Promise<ComponentHealth> {
  const base = process.env.COMPUTE_SERVICE_URL?.replace(/\/+$/, "");

  // all-in-one は同一プロセスで sharp/skia を持つ（compute サービス無し）
  if (isAllInOne) {
    return {
      key: "compute",
      label: "compute（画像生成）",
      state: "ok",
      summary: "all-in-one（同一プロセス）",
      meta: [],
    };
  }
  if (!base) {
    return {
      key: "compute",
      label: "compute（画像生成）",
      state: "unknown",
      summary: "COMPUTE_SERVICE_URL 未設定で確認できません",
      meta: [],
    };
  }

  const startedAt = Date.now();
  const r = await fetchJson(`${base}/api/health`);
  const ms = Date.now() - startedAt;
  if (!r) {
    return {
      key: "compute",
      label: "compute（画像生成）",
      state: "down",
      summary: "応答なし（到達不可 or タイムアウト）",
      meta: [{ label: "接続先", value: base }],
    };
  }
  if (!r.ok) {
    return {
      key: "compute",
      label: "compute（画像生成）",
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
    label: "compute（画像生成）",
    state: "ok",
    summary: `正常 (${ms}ms)`,
    meta: [
      { label: "role", value: computeRole },
      { label: "応答", value: `${ms}ms` },
    ],
  };
}

/** /api/health/stream 相当のレスポンスから streaming 部分を取り出す。 */
function pickStreamHealth(body: unknown): MentionStreamHealth | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.connected !== "boolean") return null;
  return {
    connected: Boolean(b.connected),
    started: Boolean(b.started),
    streamingHost: (b.streamingHost as string | null) ?? null,
    mentionCount: Number(b.mentionCount ?? 0),
    reconnectAttempts: Number(b.reconnectAttempts ?? 0),
    lastCloseCode: (b.lastCloseCode as number | null) ?? null,
    connectedSince: (b.connectedSince as number | null) ?? null,
    uptimeMs: (b.uptimeMs as number | null) ?? null,
    lastEventAgeMs: (b.lastEventAgeMs as number | null) ?? null,
    lastMentionAgeMs: (b.lastMentionAgeMs as number | null) ?? null,
  };
}

/**
 * worker-front（キュー consumer＋Bot受信）と Bot Streaming を確認して2枚のカードを返す。
 * 1回の取得（in-process or /api/health/stream）から両方を導く。
 */
async function checkWorkerAndStream(): Promise<ComponentHealth[]> {
  let health: MentionStreamHealth | null = null;
  // reachable: true=応答あり / false=到達不可 / null=確認不可（URL未設定）
  let reachable: boolean | null = null;
  let note = "";

  if (isAllInOne) {
    const { summarizeMentionStream } = await import("@/lib/mention/streamer");
    health = summarizeMentionStream();
    reachable = true;
    note = "all-in-one（同一プロセス）";
  } else {
    const base = process.env.WORKER_FRONT_INTERNAL_URL?.replace(/\/+$/, "");
    if (!base) {
      note = "WORKER_FRONT_INTERNAL_URL 未設定で確認できません";
    } else {
      const r = await fetchJson(`${base}/api/health/stream`);
      if (!r) {
        reachable = false;
        note = "応答なし（到達不可 or タイムアウト）";
      } else {
        // /api/health/stream は未接続時に 503 を返すが body は読める
        reachable = true;
        health = pickStreamHealth(r.body);
      }
    }
  }

  // --- worker-front プロセス自体の生死 ---
  const worker: ComponentHealth = {
    key: "worker-front",
    label: "worker-front（ジョブ/Bot受信）",
    state: reachable === true ? "ok" : reachable === false ? "down" : "unknown",
    summary:
      reachable === true
        ? isAllInOne
          ? "all-in-one（同一プロセス）"
          : "稼働中"
        : reachable === false
          ? note
          : note,
    meta: isAllInOne ? [] : [{ label: "接続", value: reachable === true ? "OK" : reachable === false ? "NG" : "未確認" }],
  };

  // --- Bot Streaming（メンション受信 WebSocket） ---
  let stream: ComponentHealth;
  if (!health) {
    stream = {
      key: "stream",
      label: "Bot Streaming（メンション受信）",
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
      label: "Bot Streaming（メンション受信）",
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
