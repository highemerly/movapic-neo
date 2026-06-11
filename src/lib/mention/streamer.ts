/**
 * Mastodon Streaming API（WebSocket）でメンション通知を即時受信する高速経路。
 *
 * 役割分担:
 * - streaming（このファイル）: 低レイテンシでメンションを受信し即 enqueue する主経路。
 * - cron（/api/v1/ingest/mention を数分ごとにポーリング）: 安全網。
 *   再接続中のギャップ・サイレント切断・インスタンス側 streaming 停止を取りこぼさない。
 * - dedup は jobKey=mention:statusId で担保されるため、両経路の二重受信は安全。
 *
 * worker-front（と dev all-in-one）の常駐プロセスでのみ起動する。
 * Node 22 のグローバル WebSocket（undici）を使うため追加依存は不要。
 */

import WebSocket, { type RawData } from "ws";
import { enqueueMention } from "@/lib/queue";
import { USER_AGENT } from "@/lib/userAgent";
import { pollAndEnqueueMentions } from "./ingest";
import { advanceLastNotificationId, type MastodonNotification } from "./fetcher";

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
/**
 * 死活監視（watchdog）の ping 間隔。
 * グローバル WebSocket は ping/pong を surface せず、静かなストリームでは message も来ないため、
 * クライアントから能動的に ping し、次の ping までに pong が返らなければサイレント切断とみなす。
 * 検知は最悪 2×PING で ~60s 以内。
 */
const PING_INTERVAL_MS = 30_000;

const getBotInstanceUrl = () => process.env.MASTODON_BOT_INSTANCE_URL || "https://handon.club";
const getBotAccessToken = () => process.env.MASTODON_BOT_ACCESS_TOKEN || "";

let ws: WebSocket | null = null;
let backoffMs = INITIAL_BACKOFF_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let cachedStreamingBase: string | null = null;

/**
 * 接続状況。ヘルスチェックエンドポイントから参照する。
 *
 * Next.js では instrumentation.ts（streaming 起動側）とルートハンドラが別バンドルになり
 * モジュールローカル変数を共有できないことがあるため、状態は globalThis に置いて
 * 同一プロセス内での共有を保証する。
 */
export interface MentionStreamStatus {
  /** startMentionStream() が呼ばれ streaming 経路が有効化されているか */
  started: boolean;
  /** 現在 WebSocket が OPEN か */
  connected: boolean;
  /** 接続先 streaming ホスト（token は含めない） */
  streamingHost: string | null;
  /** 最後に OPEN した時刻（epoch ms） */
  connectedSince: number | null;
  /** 最後に何らかのフレームを受信した時刻（生存確認用、heartbeat 含む） */
  lastEventAt: number | null;
  /** 最後にメンションを受信した時刻 */
  lastMentionAt: number | null;
  /** プロセス起動以降に受信したメンション総数 */
  mentionCount: number;
  /** 直近の接続成功以降の再接続試行回数（OPEN でリセット） */
  reconnectAttempts: number;
  /** 直近の close コード */
  lastCloseCode: number | null;
}

const globalStore = globalThis as unknown as {
  __mentionStreamStatus?: MentionStreamStatus;
};

function status(): MentionStreamStatus {
  if (!globalStore.__mentionStreamStatus) {
    globalStore.__mentionStreamStatus = {
      started: false,
      connected: false,
      streamingHost: null,
      connectedSince: null,
      lastEventAt: null,
      lastMentionAt: null,
      mentionCount: 0,
      reconnectAttempts: 0,
      lastCloseCode: null,
    };
  }
  return globalStore.__mentionStreamStatus;
}

/** 接続状況のスナップショットを返す（ヘルスチェック用）。 */
export function getMentionStreamStatus(): MentionStreamStatus {
  return { ...status() };
}

/**
 * streaming 接続を開始する。多重起動はガードされ、トークン未設定なら no-op。
 * instrumentation.ts から呼ばれる（await 不要・内部で非同期に接続を張る）。
 */
export function startMentionStream(): void {
  if (status().started) return;

  const accessToken = getBotAccessToken();
  if (!accessToken) {
    console.log("[mention-stream] MASTODON_BOT_ACCESS_TOKEN 未設定のため streaming を起動しません");
    return;
  }

  status().started = true;
  void connect().catch((e) => {
    console.error("[mention-stream] connect failed:", e);
    scheduleReconnect();
  });
}

/**
 * streaming の WS ベースURLを解決する。
 * Mastodon は streaming を別サブドメイン（例: wss://streaming.handon.club）で
 * 配信することがあるため、instance API の configuration.urls.streaming を優先採用する。
 * 取得できなければ instance host から導出（メインホストが WS をプロキシする構成向け）。
 * 解決結果はプロセス内でキャッシュする。
 */
async function resolveStreamingBaseUrl(instanceUrl: string): Promise<string> {
  const override = process.env.MASTODON_BOT_STREAMING_URL;
  if (override) return override;
  if (cachedStreamingBase) return cachedStreamingBase;

  try {
    const res = await fetch(`${instanceUrl}/api/v2/instance`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      const url: string | undefined = data?.configuration?.urls?.streaming;
      if (url) {
        cachedStreamingBase = url;
        return url;
      }
    }
  } catch (e) {
    console.error("[mention-stream] streaming URL 取得に失敗、instance host にフォールバック:", e);
  }

  const u = new URL(instanceUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  cachedStreamingBase = `${u.protocol}//${u.host}`;
  return cachedStreamingBase;
}

function buildStreamUrl(streamingBase: string, accessToken: string): string {
  const u = new URL(streamingBase);
  if (u.protocol === "https:") u.protocol = "wss:";
  else if (u.protocol === "http:") u.protocol = "ws:";
  u.pathname = "/api/v1/streaming";
  u.search = "";
  // user:notification ストリームは通知イベントのみを配信する
  u.searchParams.set("stream", "user:notification");
  u.searchParams.set("access_token", accessToken);
  return u.toString();
}

async function connect(): Promise<void> {
  const instanceUrl = getBotInstanceUrl();
  const accessToken = getBotAccessToken();
  const streamingBase = await resolveStreamingBaseUrl(instanceUrl);
  const url = buildStreamUrl(streamingBase, accessToken);

  // token を URL に含むため url 自体はログに出さない（host のみ）
  console.log(`[mention-stream] connecting to ${new URL(streamingBase).host} (stream=user:notification)`);

  let socket: WebSocket;
  try {
    socket = new WebSocket(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    console.error("[mention-stream] WebSocket 生成に失敗:", err);
    scheduleReconnect();
    return;
  }
  ws = socket;

  // watchdog: 直近の ping に対して pong が返ったか。pong が来ないまま次の ping 周期を
  // 迎えたらサイレント切断とみなして terminate（→ close → 再接続）する。
  let awaitingPong = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  socket.on("open", () => {
    backoffMs = INITIAL_BACKOFF_MS;
    const s = status();
    s.connected = true;
    s.connectedSince = Date.now();
    s.lastEventAt = Date.now();
    s.streamingHost = new URL(streamingBase).host;
    s.reconnectAttempts = 0;
    console.log("[mention-stream] connected");

    // 死活監視を開始（クライアント主導 ping）
    awaitingPong = false;
    heartbeatTimer = setInterval(() => {
      if (awaitingPong) {
        // 前回 ping の pong が未着 → 死んでいるとみなして切断（close で再接続）
        console.warn("[mention-stream] pong timeout — terminating dead connection");
        socket.terminate();
        return;
      }
      awaitingPong = true;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }, PING_INTERVAL_MS);

    // 接続が確立するまでのギャップを since_id ポーリングで埋める（取りこぼし防止）
    pollAndEnqueueMentions(instanceUrl, accessToken, 10)
      .then(({ enqueued }) => {
        if (enqueued > 0) {
          console.log(`[mention-stream] catch-up enqueued=${enqueued}`);
        }
      })
      .catch((e) => console.error("[mention-stream] catch-up failed:", e));
  });

  socket.on("message", (data: RawData) => {
    handleFrame(data.toString());
  });

  // サーバ ping / 自前 ping への pong は生存信号。watchdog をリセットしつつ生存時刻を更新。
  socket.on("ping", () => {
    status().lastEventAt = Date.now();
  });
  socket.on("pong", () => {
    awaitingPong = false;
    status().lastEventAt = Date.now();
  });

  socket.on("error", (err: Error) => {
    // error の直後に close が来るため、ここでは再接続をスケジュールしない
    console.error("[mention-stream] socket error:", err?.message ?? err);
  });

  socket.on("close", (code: number) => {
    stopHeartbeat();
    if (ws === socket) ws = null;
    const s = status();
    s.connected = false;
    s.lastCloseCode = code;
    console.warn(`[mention-stream] closed (code=${code}) — reconnecting`);
    scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  status().reconnectAttempts++;
  // 指数バックオフ + ジッタ（thundering herd 回避）。token 不正等の連続失敗を上限で頭打ち。
  const jitter = Math.floor(backoffMs * 0.2 * fractionFrom(reconnectSeed++));
  const delay = Math.min(backoffMs, MAX_BACKOFF_MS) + jitter;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect().catch((e) => {
      console.error("[mention-stream] reconnect failed:", e);
      scheduleReconnect();
    });
  }, delay);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

// Math.random は instrumentation 経由の決定性を壊さないため自前の擬似ジッタを使う
let reconnectSeed = 1;
function fractionFrom(n: number): number {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

function handleFrame(raw: string): void {
  // heartbeat 含むあらゆる受信で生存時刻を更新（サイレント切断の検知に使える）
  status().lastEventAt = Date.now();

  let msg: { event?: string; payload?: string };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.event !== "notification" || typeof msg.payload !== "string") return;

  let notification: MastodonNotification;
  try {
    notification = JSON.parse(msg.payload);
  } catch {
    return;
  }

  // メンション以外（favourite/follow/reblog 等）は無視。status 付きのみ処理可能。
  if (notification.type !== "mention" || !notification.status) return;

  const s = status();
  s.lastMentionAt = Date.now();
  s.mentionCount++;
  console.log(
    `[mention-stream] mention received: status=${notification.status.id} from @${notification.account.acct}`
  );
  enqueueMention({ notification })
    .then(() => advanceLastNotificationId(notification.id))
    .catch((e) =>
      console.error(`[mention-stream] enqueue failed for ${notification.id}:`, e)
    );
}
