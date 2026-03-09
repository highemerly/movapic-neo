/**
 * シンプルなIPベースのレート制限
 * 前回アクセスから指定秒数以内のリクエストを拒否する
 */

const lastAccessMap = new Map<string, number>();

// 設定
const RATE_LIMIT_MS = 5000; // 5秒
const CLEANUP_INTERVAL_MS = 60000; // 1分ごとにクリーンアップ
const ENTRY_TTL_MS = 60000; // 1分以上古いエントリは削除

let lastCleanup = Date.now();

/**
 * 古いエントリを削除してメモリリークを防止
 */
function cleanupOldEntries(): void {
  const now = Date.now();

  // クリーンアップ間隔が経過していない場合はスキップ
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanup = now;

  for (const [ip, timestamp] of lastAccessMap.entries()) {
    if (now - timestamp > ENTRY_TTL_MS) {
      lastAccessMap.delete(ip);
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

  // 定期的にクリーンアップを実行
  cleanupOldEntries();

  const lastAccess = lastAccessMap.get(ip);

  if (lastAccess) {
    const elapsed = now - lastAccess;
    if (elapsed < RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      return { allowed: false, retryAfter };
    }
  }

  // アクセス時刻を記録
  lastAccessMap.set(ip, now);
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
