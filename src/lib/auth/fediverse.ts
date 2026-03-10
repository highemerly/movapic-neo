/**
 * Fediverse（Mastodon/Misskey）インスタンスとの通信
 */

const USER_AGENT = "movapic/1.0";
const REQUEST_TIMEOUT = 15000; // 15秒

/**
 * インスタンスの種類を判別
 */
export type InstanceType = "mastodon" | "misskey" | "unknown";

export interface InstanceInfo {
  type: InstanceType;
  domain: string;
  title?: string;
  version?: string;
}

/**
 * プライベートIPアドレスをチェック
 */
function isPrivateIP(hostname: string): boolean {
  // localhost
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  // IPv4プライベートアドレス
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
  ];

  for (const range of privateRanges) {
    if (range.test(hostname)) {
      return true;
    }
  }

  return false;
}

/**
 * サーバー名を正規化
 */
export function normalizeServer(server: string): string {
  // プロトコルを除去
  let normalized = server.replace(/^https?:\/\//, "");
  // 末尾のスラッシュを除去
  normalized = normalized.replace(/\/+$/, "");
  // 小文字に変換
  normalized = normalized.toLowerCase();
  return normalized;
}

/**
 * インスタンスの種類を検出
 */
export async function detectInstanceType(server: string): Promise<InstanceInfo> {
  const normalizedServer = normalizeServer(server);

  if (isPrivateIP(normalizedServer)) {
    throw new Error("プライベートIPアドレスは許可されていません");
  }

  // Mastodonの場合
  try {
    const mastodonResponse = await fetch(
      `https://${normalizedServer}/api/v1/instance`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      }
    );

    if (mastodonResponse.ok) {
      const data = await mastodonResponse.json();
      return {
        type: "mastodon",
        domain: normalizedServer,
        title: data.title,
        version: data.version,
      };
    }
  } catch {
    // Mastodonではない
  }

  // Misskeyの場合
  try {
    const misskeyResponse = await fetch(
      `https://${normalizedServer}/api/meta`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      }
    );

    if (misskeyResponse.ok) {
      const data = await misskeyResponse.json();
      return {
        type: "misskey",
        domain: normalizedServer,
        title: data.name,
        version: data.version,
      };
    }
  } catch {
    // Misskeyでもない
  }

  throw new Error("サポートされていないインスタンスです");
}

/**
 * Mastodon: アプリケーションを動的に登録
 */
export interface MastodonAppCredentials {
  clientId: string;
  clientSecret: string;
}

export async function registerMastodonApp(
  server: string,
  redirectUri: string
): Promise<MastodonAppCredentials> {
  const response = await fetch(`https://${server}/api/v1/apps`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_name: "movapic",
      redirect_uris: redirectUri,
      scopes: "read write:statuses write:media",
      website: process.env.NEXT_PUBLIC_APP_URL,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`アプリケーション登録に失敗しました: ${error}`);
  }

  const data = await response.json();
  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
  };
}

/**
 * Mastodon: 認可URLを生成
 */
export function getMastodonAuthorizationUrl(
  server: string,
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read write:statuses write:media",
    state,
  });

  return `https://${server}/oauth/authorize?${params.toString()}`;
}

/**
 * Mastodon: 認可コードをアクセストークンに交換
 */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  scope: string;
  createdAt: number;
}

export async function exchangeMastodonCode(
  server: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const response = await fetch(`https://${server}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`トークン交換に失敗しました: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
    createdAt: data.created_at,
  };
}

/**
 * Mastodon: ユーザー情報を取得
 */
export interface FediverseAccount {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function getMastodonAccount(
  server: string,
  accessToken: string
): Promise<FediverseAccount> {
  const response = await fetch(
    `https://${server}/api/v1/accounts/verify_credentials`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ユーザー情報の取得に失敗しました: ${error}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name || null,
    avatarUrl: data.avatar || null,
  };
}

/**
 * Mastodon: アクセストークンを無効化
 */
export async function revokeMastodonToken(
  server: string,
  clientId: string,
  clientSecret: string,
  accessToken: string
): Promise<void> {
  const response = await fetch(`https://${server}/oauth/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: accessToken,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`トークン無効化に失敗しました: ${error}`);
  }
}

/**
 * Misskey: MiAuth認可URLを生成
 */
export function getMisskeyAuthorizationUrl(
  server: string,
  sessionId: string,
  callbackUrl: string
): string {
  const params = new URLSearchParams({
    name: "movapic",
    callback: callbackUrl,
    permission: "read:account,write:notes,drive:write",
  });

  return `https://${server}/miauth/${sessionId}?${params.toString()}`;
}

/**
 * Misskey: MiAuthセッションを確認してトークンを取得
 */
export async function checkMisskeySession(
  server: string,
  sessionId: string
): Promise<{ token: string; user: FediverseAccount }> {
  const response = await fetch(
    `https://${server}/api/miauth/${sessionId}/check`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiAuth確認に失敗しました: ${error}`);
  }

  const data = await response.json();

  if (!data.ok || !data.token) {
    throw new Error("MiAuth認証が完了していません");
  }

  return {
    token: data.token,
    user: {
      id: data.user.id,
      username: data.user.username,
      displayName: data.user.name || null,
      avatarUrl: data.user.avatarUrl || null,
    },
  };
}
