/**
 * IPベースのスライディングウィンドウ・レート制限（画像プレビュー生成用）。
 * ウィンドウ内の許可回数を超えたリクエストを拒否する。
 * Web Pod は1インスタンス前提のため、分散共有せずインメモリで判定する。
 */

import { isIPv6 } from "node:net";

// キー（IP）ごとの、直近ウィンドウ内アクセス時刻（昇順）。
const accessLog = new Map<string, number[]>();

// 画像プレビュー生成: WINDOW 内で MAX 回まで許可する。
// NOTE: この2値は将来的に環境変数へ切り出す想定（公開リポジトリで閾値を隠すため）。現状はハードコード。
const PREVIEW_WINDOW_MS = 10_000; // 10秒
const PREVIEW_MAX = 2; // 10秒あたり2回

const CLEANUP_INTERVAL_MS = 60000; // 1分ごとにクリーンアップ
let lastCleanup = Date.now();

/**
 * ウィンドウより古い記録しか残っていないキーを削除してメモリリークを防止する。
 */
function cleanupOldEntries(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;

  for (const [ip, times] of accessLog.entries()) {
    // 直近の記録すらウィンドウ外なら、このキーは丸ごと不要
    if (times.length === 0 || now - times[times.length - 1] > PREVIEW_WINDOW_MS) {
      accessLog.delete(ip);
    }
  }
}

/**
 * 数える単位。IPv6 は /64 にまとめる（1契約・1端末に /64 が丸ごと割り当てられるのが普通で、
 * アドレス単位だと下位64ビットを変えるだけで実質無制限になるため）。IPv4 はそのまま。
 */
export function rateLimitKey(ip: string): string {
  const addr = ip.replace(/%.*$/, ""); // ゾーンID（fe80::1%eth0）は落とす
  if (!isIPv6(addr)) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(addr);
  if (mapped) return mapped[1];

  // "::" を展開して8グループにする。末尾の埋め込み IPv4（a.b.c.d）は2グループぶんで、/64 には影響しない
  const [headPart, tailPart] = addr.split("::");
  const groups = (part: string | undefined) =>
    part ? part.split(":").flatMap((g) => (g.includes(".") ? ["0", "0"] : [g])) : [];
  const head = groups(headPart);
  const tail = tailPart === undefined ? [] : groups(tailPart);
  const full =
    tailPart === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  const prefix = full
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":");
  return `${prefix}::/64`;
}

/**
 * レート制限をチェック
 * @param clientIp クライアントのIPアドレス（IPv6 は /64 単位で数える）
 * @returns { allowed: boolean, retryAfter?: number }
 */
export function checkRateLimit(clientIp: string): {
  allowed: boolean;
  retryAfter?: number;
} {
  const ip = rateLimitKey(clientIp);
  const now = Date.now();
  cleanupOldEntries(now);

  const windowStart = now - PREVIEW_WINDOW_MS;
  // ウィンドウ外の古い記録を落とす
  const times = (accessLog.get(ip) ?? []).filter((t) => t > windowStart);

  if (times.length >= PREVIEW_MAX) {
    // 最も古い記録がウィンドウから外れれば1枠空く
    const retryAfter = Math.ceil((times[0] + PREVIEW_WINDOW_MS - now) / 1000);
    // 拒否時も掃除済みの配列を書き戻す（際限なく伸びるのを防ぐ）
    accessLog.set(ip, times);
    return { allowed: false, retryAfter };
  }

  times.push(now);
  accessLog.set(ip, times);
  return { allowed: true };
}

/**
 * クライアントのIPアドレスを取得
 * プロキシ経由の場合はX-Forwarded-Forヘッダーを参照
 */
export function getClientIp(request: Request): string {
  // Cloudflare
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // 一般的なプロキシ
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // 最初のIPがクライアントIP
    return xForwardedFor.split(",")[0].trim();
  }

  // X-Real-IP (nginx)
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp;
  }

  // フォールバック
  return "unknown";
}
