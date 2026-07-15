/**
 * IPベースのスライディングウィンドウ・レート制限（画像プレビュー生成用）。
 * ウィンドウ内の許可回数を超えたリクエストを拒否する。
 * Web Pod は1インスタンス前提のため、分散共有せずインメモリで判定する。
 */

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
 * レート制限をチェック
 * @param ip クライアントのIPアドレス
 * @returns { allowed: boolean, retryAfter?: number }
 */
export function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfter?: number;
} {
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
