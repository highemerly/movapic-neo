/**
 * Fediverse サーバーの受け入れポリシー（env 読み取りの単一集約点）。
 *
 * - LOGIN_PLATFORM: ログインを許可するプラットフォーム（カンマ区切り）。未設定 = mastodon,misskey。
 * - ALLOWED_SERVERS: ログインを許可するサーバー（カンマ区切り）。未設定 = 全許可。
 * - DENIED_SERVERS : ログインを拒否するサーバー（カンマ区切り）。既存アカウントには影響しない。
 * - HOME_SERVER    : ホームインスタンス（単一値）。所属ユーザーのプロフィールURLを素の username にする。
 * - FAVOR_SERVERS  : 特典対象サーバー（カンマ区切り）。現状の特典は皆勤賞 grace の緩和。
 *
 * ドメインは全て normalizeServer 相当（小文字）で比較する前提で、ここで小文字化して返す。
 */

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
  return parseServerList(allowed);
}

/**
 * ログインを拒否するサーバー。ログイン開始のみ弾き、既存アカウント・セッションには影響しない。
 * 将来 admin GUI からの追加（DB 保持分とのマージ）を予定しているため、
 * 拒否リストの取得は必ずこの関数を経由すること（差し替えの単一チョークポイント）。
 */
export function getDeniedServers(): string[] {
  return parseServerList(process.env.DENIED_SERVERS);
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
  return raw.trim().toLowerCase();
}

/** 特典対象サーバー。未設定なら特典なし。 */
export function getFavorServers(): string[] {
  return parseServerList(process.env.FAVOR_SERVERS);
}
