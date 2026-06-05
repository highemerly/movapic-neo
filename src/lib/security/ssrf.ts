/**
 * SSRF（Server-Side Request Forgery）対策
 *
 * ユーザー入力に由来するホスト名・URLへサーバーから fetch する前に、
 * 解決先IPが内部・予約済みアドレスでないことを検証する。
 *
 * 文字列パターンだけでなくDNS解決まで行い、IPv4/IPv6の両方を検査する。
 * 注: 解決後に別IPへ切り替える完全なDNSリバインディングまでは防げないが、
 * 生のプライベートIP・localhost・短TTLでない内部名は確実にブロックできる。
 */

import { lookup } from "dns/promises";
import net from "net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * IPv4アドレスがプライベート・予約済みか判定
 */
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return true; // 不正な形式はブロック
  }
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8（"このネットワーク"）
  if (a === 10) return true; // 10.0.0.0/8（プライベート）
  if (a === 127) return true; // 127.0.0.0/8（ループバック）
  if (a === 169 && b === 254) return true; // 169.254.0.0/16（リンクローカル）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12（プライベート）
  if (a === 192 && b === 168) return true; // 192.168.0.0/16（プライベート）
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10（CGNAT）
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24（IETF）
  if (a >= 224) return true; // 224.0.0.0/4（マルチキャスト）+ 240.0.0.0/4（予約）

  return false;
}

/**
 * IPv6アドレスがプライベート・予約済みか判定
 */
function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  if (lower === "::1") return true; // ループバック
  if (lower === "::") return true; // 未指定アドレス
  if (lower.startsWith("fe80")) return true; // リンクローカル fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ユニークローカル fc00::/7

  // IPv4射影アドレス（::ffff:a.b.c.d）はIPv4側の判定に委ねる
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isBlockedIPv4(mapped[1]);
  }

  return false;
}

/**
 * IPアドレス文字列がブロック対象（内部・予約済み）か判定
 */
export function isBlockedIP(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIPv4(ip);
  if (type === 6) return isBlockedIPv6(ip);
  return true; // IPとして解釈できないものはブロック
}

/**
 * ホスト名（またはIPリテラル）が外部fetch先として安全か検証する。
 * 安全でない場合は SsrfError を投げる。
 */
export async function assertSafeRemoteHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();

  if (host.length === 0) {
    throw new SsrfError("ホスト名が空です");
  }

  // IPリテラルが直接指定された場合はそのまま判定
  if (net.isIP(host)) {
    if (isBlockedIP(host)) {
      throw new SsrfError("内部アドレスへのアクセスは許可されていません");
    }
    return;
  }

  // 内部用の名前を明示的にブロック
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new SsrfError("内部ホストへのアクセスは許可されていません");
  }

  // DNS解決して、全ての解決先IPが公開アドレスであることを確認
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SsrfError("ホスト名を解決できませんでした");
  }

  if (addresses.length === 0) {
    throw new SsrfError("ホスト名を解決できませんでした");
  }

  for (const { address } of addresses) {
    if (isBlockedIP(address)) {
      throw new SsrfError("内部アドレスへのアクセスは許可されていません");
    }
  }
}

/**
 * URL文字列が外部fetch先として安全か検証する。
 * httpsのみ許可し、ホスト名を検証したうえで URL オブジェクトを返す。
 * 安全でない場合は SsrfError を投げる。
 */
export async function assertSafeRemoteUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("不正なURLです");
  }

  if (url.protocol !== "https:") {
    throw new SsrfError("httpsのURLのみ許可されています");
  }

  await assertSafeRemoteHost(url.hostname);
  return url;
}
