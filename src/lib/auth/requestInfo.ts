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
  const country =
    cfCountry && /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : null;

  return { ipAddress, userAgent, country };
}
