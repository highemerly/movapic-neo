/**
 * Fediverse サーバーの受け入れポリシー（env 読み取りの単一集約点）。
 *
 * - LOGIN_PLATFORM: ログインを許可するプラットフォーム（カンマ区切り）。未設定 = mastodon,misskey。
 * - ALLOWED_SERVERS: ログインを許可するサーバー（カンマ区切り）。未設定 = 全許可。
 * - DENIED_SERVERS : ログインを拒否するサーバー（カンマ区切り）。既存アカウントには影響しない。
 * - HOME_SERVER    : ホームインスタンス（単一値）。所属ユーザーのプロフィールURLを素の username にする。
 * - FAVOR_SERVERS  : 特典対象サーバー（カンマ区切り）。特典は皆勤賞の穴埋め枠（2026-09 以前は grace +1日、
 *                    2026-10 以降は穴埋めポイント 毎月+1pt）。
 *
 * ドメインはログイン入力と同じ parseServerHostname の正規形にして返す（Instance.domain と同じ形）。
 * pitfall: 以前は trim と小文字化だけで、設定に punycode（xn--…）や全角で書くと Unicode で保存された
 * Instance.domain と一致しなかった。ドメインとして解釈できない値は、黙って無視すると拒否リストに
 * 穴が開くため即座に落とす。
 */

import { parseServerHostname } from "./serverIdentity";

export type LoginPlatform = "mastodon" | "misskey";

const ALL_PLATFORMS: readonly LoginPlatform[] = ["mastodon", "misskey"];

/** カンマ区切り env を trim + 小文字化して配列にする（空要素は除去）。 */
function parseServerList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== "");
}

/** カンマ区切りのドメインの env を正規形の配列にする。ドメインとして解釈できない値があれば落とす。 */
function parseDomainList(name: string, value: string | undefined): string[] {
  return parseServerList(value).map((item) => {
    const domain = parseServerHostname(item);
    if (!domain) {
      throw new Error(`${name} にドメインとして解釈できない値があります: "${item}"`);
    }
    return domain;
  });
}

/** ログインを許可するプラットフォーム。未設定・空なら両方許可。 */
export function getLoginPlatforms(): Set<LoginPlatform> {
  const raw = process.env.LOGIN_PLATFORM;
  const items = parseServerList(raw);
  if (items.length === 0) return new Set(ALL_PLATFORMS);
  for (const item of items) {
    if (!(ALL_PLATFORMS as readonly string[]).includes(item)) {
      // typo をサイレントに無視すると「なぜかログインできない」で迷子になるため即座に落とす
      throw new Error(
        `LOGIN_PLATFORM に不明な値があります: "${item}"（mastodon / misskey のみ指定可能）`
      );
    }
  }
  return new Set(items as LoginPlatform[]);
}

/** ログインを許可するサーバー。未設定・空文字なら制限なし（=自由入力）として undefined を返す。 */
export function getAllowedServers(): string[] | undefined {
  const allowed = process.env.ALLOWED_SERVERS;
  if (!allowed || allowed.trim() === "") {
    return undefined;
  }
  return parseDomainList("ALLOWED_SERVERS", allowed);
}

/**
 * ログインを拒否するサーバー。ログイン開始のみ弾き、既存アカウント・セッションには影響しない。
 * 将来 admin GUI からの追加（DB 保持分とのマージ）を予定しているため、
 * 拒否リストの取得は必ずこの関数を経由すること（差し替えの単一チョークポイント）。
 */
export function getDeniedServers(): string[] {
  return parseDomainList("DENIED_SERVERS", process.env.DENIED_SERVERS);
}

/**
 * ホームインスタンス（プロフィールURLで domain を省略できる既定サーバー）。
 * 未設定なら undefined（= 短縮URL機能は無効・全ユーザー username@domain）。
 */
export function getHomeServer(): string | undefined {
  const raw = process.env.HOME_SERVER;
  if (!raw || raw.trim() === "") return undefined;
  if (raw.includes(",")) {
    // 複数指定は URL の一意性が壊れる（同名ユーザーの衝突）ため設定ミスとして即座に落とす
    throw new Error("HOME_SERVER には単一のドメインのみ指定できます");
  }
  const domain = parseServerHostname(raw);
  if (!domain) {
    throw new Error(`HOME_SERVER がドメインとして解釈できません: "${raw}"`);
  }
  return domain;
}

/** 特典対象サーバー。未設定なら特典なし。 */
export function getFavorServers(): string[] {
  return parseDomainList("FAVOR_SERVERS", process.env.FAVOR_SERVERS);
}

/**
 * そのインスタンスドメインが特典対象サーバーか（大文字小文字は区別しない）。
 * 特典は「2026-09 以前の皆勤賞 grace +1日」と「2026-10 以降の穴埋めポイント 毎月+1pt」。
 */
export function isFavorServer(instanceDomain: string | null | undefined): boolean {
  return !!instanceDomain && getFavorServers().includes(instanceDomain.toLowerCase());
}
