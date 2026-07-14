/**
 * bot streaming（メンション受信 WebSocket）のヘルス取得。
 *
 * 取得の仕方は環境で分岐する:
 *  - all-in-one（COMPONENT_ROLE 未設定）: 状態は同一プロセスの globalThis にあるので in-process で読む。
 *  - 分離構成: 状態は worker-front プロセスにあるため `WORKER_FRONT_INTERNAL_URL/api/health/stream` を叩く。
 *
 * この「取得」部分は /admin/stats（詳細表示）と /create/bot（一般ユーザー向け簡易表示）の両方で
 * 共有する。表示（正常/異常の文言・出す meta）は用途ごとに呼び出し側で組み立てる:
 *  - admin: 接続先ホストや close コードまで含む詳細（{@link ../admin/health}）
 *  - 一般ユーザー: 運用詳細は伏せ、正常/異常だけを穏やかに（{@link getBotStreamStatus}）
 */

import { USER_AGENT } from "@/lib/userAgent";
import type { MentionStreamHealth } from "@/lib/mention/streamer";

/** ok=正常 / warn=稼働だが注意 / down=異常 / unknown=確認不可 */
export type StreamHealthState = "ok" | "warn" | "down" | "unknown";

/** streaming の受信停滞をどれだけ許容するか（超過で warn）。heartbeat 込みで通常 ~30s 間隔。 */
export const STREAM_STALE_MS = 3 * 60_000;

/** /api/health/stream 相当のレスポンス body から streaming 部分を取り出す。connected が無ければ null。 */
export function pickStreamHealth(body: unknown): MentionStreamHealth | null {
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

export interface MentionStreamAcquire {
  /** ストリームの生ヘルス。取得できなければ null */
  health: MentionStreamHealth | null;
  /** true=応答あり / false=到達不可（タイムアウト等）/ null=確認不可（URL未設定） */
  reachable: boolean | null;
  /** 分離構成での /api/health/stream 生レスポンス（version 抽出用）。all-in-one / 未取得は null */
  body: unknown;
  /** all-in-one（同一プロセス）か */
  inProcess: boolean;
  /** 未設定/到達不可などの説明（admin の worker-front カード用） */
  note: string;
}

/**
 * bot streaming の生ヘルスを取得する。取得方法（in-process / HTTP）の分岐をここに集約し、
 * admin・一般ユーザー双方から使う。to admin では body / note / inProcess も使う。
 */
export async function getMentionStreamHealth(): Promise<MentionStreamAcquire> {
  const role = process.env.COMPONENT_ROLE || "";
  // all-in-one: 同一プロセスの状態を直接読む（HTTP を張らない）。
  if (role === "") {
    const { summarizeMentionStream } = await import("@/lib/mention/streamer");
    return {
      health: summarizeMentionStream(),
      reachable: true,
      body: null,
      inProcess: true,
      note: "all-in-one（同一プロセス）",
    };
  }
  const base = process.env.WORKER_FRONT_INTERNAL_URL?.replace(/\/+$/, "");
  if (!base) {
    return {
      health: null,
      reachable: null,
      body: null,
      inProcess: false,
      note: "WORKER_FRONT_INTERNAL_URL 未設定で確認できません",
    };
  }
  try {
    const res = await fetch(`${base}/api/health/stream`, {
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    // /api/health/stream は未接続時に 503 を返すが body は読める
    const body = await res.json().catch(() => null);
    return { health: pickStreamHealth(body), reachable: true, body, inProcess: false, note: "" };
  } catch {
    return {
      health: null,
      reachable: false,
      body: null,
      inProcess: false,
      note: "応答なし（到達不可 or タイムアウト）",
    };
  }
}

/** 一般ユーザー向けの簡易ステータス（接続先ホスト・close コード等の運用詳細は含めない）。 */
export interface BotStreamStatus {
  state: StreamHealthState;
  /** 正常/やや不安定/停止中/確認中 のラベル */
  label: string;
  /** ユーザー向けの一行説明 */
  summary: string;
}

/**
 * /create/bot 用の簡易ステータス。詳細（host / reconnect / close コード）は出さず、
 * 正常か否かだけをやさしい文言で返す。
 */
export async function getBotStreamStatus(): Promise<BotStreamStatus> {
  const { health } = await getMentionStreamHealth();
  if (!health) {
    return { state: "unknown", label: "確認中", summary: "現在ステータスを確認できません。" };
  }
  if (health.connected) {
    const stale = health.lastEventAgeMs != null && health.lastEventAgeMs > STREAM_STALE_MS;
    return stale
      ? {
          state: "warn",
          label: "やや不安定",
          summary: "接続中ですが受信がやや滞っています。反映が遅れることがあります。",
        }
      : { state: "ok", label: "正常", summary: "メンション受信は正常に稼働しています。" };
  }
  if (health.started) {
    return {
      state: "down",
      label: "停止中",
      summary: "現在メンションを受信できていません。復旧までしばらくお待ちください。",
    };
  }
  return { state: "warn", label: "停止中", summary: "現在メンション受信を停止しています。" };
}
