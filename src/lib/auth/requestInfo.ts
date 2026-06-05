import type { NextRequest } from "next/server";
import type { LoginRequestInfo } from "./session";

const MAX_UA_LENGTH = 500;
const MAX_LOCATION_LENGTH = 100;

/**
 * Cloudflareの位置ヘッダー（cf-ipcity / cf-region）を整形する。
 * 制御文字（C0制御 + DEL）を除去し、長さを制限し、空なら null を返す。
 */
function sanitizeLocation(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, MAX_LOCATION_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

export function extractLoginRequestInfo(request: NextRequest): LoginRequestInfo {
  const headers = request.headers;
  const cfIp = headers.get("cf-connecting-ip");
  const xff = headers.get("x-forwarded-for");
  const ipAddress =
    cfIp?.trim() ||
    xff?.split(",")[0]?.trim() ||
    "unknown";

  const ua = headers.get("user-agent");
  const userAgent = ua ? ua.slice(0, MAX_UA_LENGTH) : null;

  const cfCountry = headers.get("cf-ipcountry");
  const normalized = cfCountry?.trim().toUpperCase() ?? null;
  // ISO 3166-1 alpha-2 のほか、Cloudflareの "XX"(unknown) / "T1"(Tor) なども英数2文字
  const country =
    normalized && /^[A-Z0-9]{2}$/.test(normalized) ? normalized : null;

  // Cloudflareの「Add visitor location headers」によるIP推定の地域（精度は低い）
  const region = sanitizeLocation(headers.get("cf-region"));
  const city = sanitizeLocation(headers.get("cf-ipcity"));

  return { ipAddress, userAgent, country, region, city };
}
