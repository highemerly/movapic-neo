import type { NextRequest } from "next/server";
import type { LoginRequestInfo } from "./session";

const MAX_UA_LENGTH = 500;

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

  return { ipAddress, userAgent, country };
}
