/**
 * SSRF（Server-Side Request Forgery）対策
 *
 * ユーザー入力に由来するホスト名・URLへサーバーから fetch する前に、
 * 解決先IPが内部・予約済みアドレスでないことを検証する。
 *
 * 2段で守る:
 *  - assertSafeRemoteHost / assertSafeRemoteUrl: 利用者の入力を受けた時点で検証し、分かりやすいエラーを返す
 *  - remoteFetch（と safeFetch）: 実際に接続する IP を接続の直前に検査する。リダイレクトの各ホップと、
 *    検証の後に DNS の答えを内部IPへ切り替える再バインドもここで止まる
 *
 * pitfall: 以前は入力時の検証だけで、ログイン後の Fediverse への通信（投稿・リアクション・削除・絵文字・
 * Bot の添付画像）は素の fetch（redirect:"follow"）だった。自分のサーバーで一度ログインすれば、
 * API の応答を 307 で http://10.x… やメタデータIPへ転送させ、閲覧や定期同期のたびにクラスタ内部へ
 * GET・POST を送らせられた（2026-11-10 確認）。
 */

import dns from "dns";
import { lookup } from "dns/promises";
import net from "net";
import { Agent, buildConnector } from "undici";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * 外部 fetch 先として許さないアドレス帯。
 * net.BlockList は IPv4 射影アドレス（::ffff:127.0.0.1・::ffff:7f00:1 のどちらの表記も）を
 * IPv4 のルールで判定する。
 * TEST-NET（192.0.2.0/24・198.51.100.0/24・203.0.113.0/24）は入れない。E2E の偽 Fediverse が
 * 198.51.100.0/24 で動いており、このガードを通して確かめている（e2e/compose.yml）。
 */
const BLOCKED_SUBNETS: ReadonlyArray<[string, number, "ipv4" | "ipv6"]> = [
  ["0.0.0.0", 8, "ipv4"], // "このネットワーク"
  ["10.0.0.0", 8, "ipv4"], // プライベート
  ["100.64.0.0", 10, "ipv4"], // CGNAT
  ["127.0.0.0", 8, "ipv4"], // ループバック
  ["169.254.0.0", 16, "ipv4"], // リンクローカル（クラウドのメタデータIPを含む）
  ["172.16.0.0", 12, "ipv4"], // プライベート
  ["192.0.0.0", 24, "ipv4"], // IETF プロトコル割当
  ["192.168.0.0", 16, "ipv4"], // プライベート
  ["198.18.0.0", 15, "ipv4"], // ベンチマーク用（内部網で使われることがある）
  ["224.0.0.0", 4, "ipv4"], // マルチキャスト
  ["240.0.0.0", 4, "ipv4"], // 予約・ブロードキャスト
  ["::", 96, "ipv6"], // 未指定・ループバック・IPv4 互換（廃止）
  ["64:ff9b:1::", 48, "ipv6"], // NAT64 のローカル用
  ["100::", 64, "ipv6"], // 破棄専用
  ["2001::", 32, "ipv6"], // Teredo（中に IPv4 を難読化して埋め込む）
  ["fc00::", 7, "ipv6"], // ユニークローカル
  ["fe80::", 10, "ipv6"], // リンクローカル
  ["fec0::", 10, "ipv6"], // サイトローカル（廃止）
  ["ff00::", 8, "ipv6"], // マルチキャスト
];

const blockList = new net.BlockList();
for (const [address, prefix, type] of BLOCKED_SUBNETS) {
  blockList.addSubnet(address, prefix, type);
}

/** IPv6 を 16bit ×8 に展開する（net.isIP で IPv6 と確かめた文字列を渡す） */
function ipv6Groups(ip: string): number[] {
  let text = ip;
  // 末尾が IPv4 表記（::ffff:1.2.3.4 など）なら 16bit ×2 に直す
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[2].split(".").map(Number);
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const parse = (part: string | undefined) =>
    part ? part.split(":").map((g) => parseInt(g, 16)) : [];
  const left = parse(head);
  const right = parse(tail);
  const zeros = tail === undefined ? [] : new Array(8 - left.length - right.length).fill(0);
  return [...left, ...zeros, ...right];
}

/**
 * IPv4 を中に埋め込む IPv6（NAT64 64:ff9b::/96・6to4 2002::/16）なら、その IPv4。
 * 64:ff9b::7f00:1 は 127.0.0.1 へ届くため、埋め込まれた側で判定する
 * （帯ごと塞ぐと、DNS64 の IPv6 だけの網から IPv4 のインスタンスへ届かなくなる）。
 */
function embeddedIPv4(ip: string): string | null {
  const g = ipv6Groups(ip);
  const toV4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return toV4(g[6], g[7]);
  }
  if (g[0] === 0x2002) return toV4(g[1], g[2]);
  return null;
}

/**
 * IPアドレス文字列がブロック対象（内部・予約済み）か判定
 */
export function isBlockedIP(ip: string): boolean {
  // ゾーンID（fe80::1%eth0）は帯の判定に関係しないので落とす
  const address = ip.replace(/%.*$/, "");
  const type = net.isIP(address);
  if (type === 4) return blockList.check(address, "ipv4");
  if (type === 6) {
    if (blockList.check(address, "ipv6")) return true;
    const v4 = embeddedIPv4(address);
    return v4 !== null && blockList.check(v4, "ipv4");
  }
  return true; // IPとして解釈できないものはブロック
}

/** 接続の直前に名前を解決し、解決先に1つでも内部アドレスがあれば接続しない */
function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number
  ) => void
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    if (addresses.length === 0 || addresses.some((a) => isBlockedIP(a.address))) {
      return callback(new SsrfError(`内部アドレスへの接続を止めました: ${hostname}`), []);
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

let guardedAgent: Agent | undefined;

/**
 * 接続先の IP を検査する dispatcher。IP 直指定のホスト（リダイレクト先の http://127.0.0.1 など）は
 * 名前解決を経ず lookup が呼ばれないため、connect で別に判定する。
 */
function getGuardedAgent(): Agent {
  if (!guardedAgent) {
    const connect = buildConnector({ lookup: guardedLookup });
    guardedAgent = new Agent({
      connect: (options, callback) => {
        const host = options.hostname.replace(/^\[|\]$/g, "");
        if (net.isIP(host) && isBlockedIP(host)) {
          callback(new SsrfError(`内部アドレスへの接続を止めました: ${host}`), null);
          return;
        }
        connect(options, callback);
      },
    });
  }
  return guardedAgent;
}

/**
 * 利用者が決められるホスト（ログインした Fediverse インスタンス・リモートの添付画像など）への fetch。
 * リダイレクトは既定どおりたどるが、各ホップの接続先 IP を検査する。
 * 内部アドレスに当たると TypeError("fetch failed")（cause が SsrfError）で失敗する。
 *
 * dispatcher は Node 組み込みの fetch と同じメジャーの undici でないと動かない
 * （undici 8 の Agent を Node 22 の fetch に渡すと invalid onRequestStart method で全部失敗する）。
 * undici の fetch を使えば版は揃うが、組み込みの FormData を認識せず本文が "[object FormData]" に
 * なる（メディアのアップロードが壊れる）ため、組み込みの fetch に undici の Agent を渡す形にしている。
 * Node のメジャーを上げるときは undici のメジャーも揃える（ssrf.test.ts で確かめている）。
 */
export function remoteFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, dispatcher: getGuardedAgent() } as RequestInit);
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

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

/**
 * 利用者入力・リモート由来の URL へ fetch する。リダイレクトは自前でたどり、転送先ごとに
 * assertSafeRemoteUrl（https 限定＋解決先IPの検査）で検証し直す。
 *
 * pitfall: 既定の redirect:"follow" では検証が最初の宛先にしか効かない。攻撃者のサーバーが
 * 307 で http://127.0.0.1 やメタデータIPへ転送すると、メソッドと本文を保ったまま内部へ届いた
 * （ログイン開始のインスタンス判定・アプリ登録で再現、2026-10-15）。
 * リダイレクト自体は禁止しない（example.com → social.example.com のように転送する正規の
 * インスタンスがあるため）。
 *
 * 本文は再送するため、string / URLSearchParams など何度でも読める値で渡すこと。
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let url = await assertSafeRemoteUrl(rawUrl);
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers);

  for (let hop = 0; ; hop++) {
    const res = await remoteFetch(url, { ...init, method, body, headers, redirect: "manual" });
    const location = res.headers.get("location");
    if (!REDIRECT_STATUSES.has(res.status) || !location) return res;

    await res.body?.cancel();
    if (hop >= MAX_REDIRECTS) {
      throw new SsrfError("リダイレクトが多すぎます");
    }
    let resolved: string;
    try {
      resolved = new URL(location, url).toString();
    } catch {
      throw new SsrfError("不正なリダイレクト先です");
    }
    const next = await assertSafeRemoteUrl(resolved);

    // 以下は fetch 仕様と同じ扱い（redirect:"manual" で自前でたどるため再現する）。
    // 303、または 301/302 の POST は GET に変えて本文を落とす。307/308 はメソッドと本文を保つ。
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
    }
    // 別オリジンへ移るときは資格情報を送らない（Bearer トークンを転送先の第三者に渡さない）。
    if (next.origin !== url.origin) {
      headers.delete("authorization");
    }
    url = next;
  }
}
