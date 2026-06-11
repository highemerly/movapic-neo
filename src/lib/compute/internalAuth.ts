/**
 * compute 内部API（/api/internal/*）の共有鍵検証。
 * worker-front → compute の内部呼び出しのみを許可する。timing-safe 比較。
 * 内部ネットワーク（ClusterIP + NetworkPolicy）前提のため X-API-Key のみ（署名は不要）。
 */
import { timingSafeEqual } from "crypto";

export function verifyComputeApiKey(request: Request): boolean {
  const expected = process.env.COMPUTE_API_KEY;
  if (!expected) {
    console.error("[compute] COMPUTE_API_KEY is not configured");
    return false;
  }
  const provided = request.headers.get("X-API-Key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
