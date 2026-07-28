/**
 * Mastodon OAuth コールバック（GET /api/auth/fediverse/callback/mastodon）の回帰テスト。
 *
 * ログインの「純粋部品」（state署名・リダイレクト検証・トークン暗号化・遷移先解決）は
 * crypto.test.ts / loginRedirect.test.ts / tokens.test.ts が既に守っている。
 * ここで守るのは、それらを繋ぐ配線＝このルート固有の判断:
 *   - 検証に落ちた経路では絶対にセッションを作らない（ログインCSRF）
 *   - アクセストークンは必ず暗号化してからDBへ入れる（平文がDBに渡らない）
 *   - invalid_client のときだけ保存済みアプリ資格情報を破棄して再登録に倒す
 *   - 成功時に一時cookie（oauth_session/oauth_state）を消す
 *
 * 外部（Fediverse HTTP・DB・セッション発行・cookie）だけモックし、crypto / tokens /
 * loginRedirect は実物を通す。実物を通すことで「暗号化された値が実際にDBへ渡るか」
 * 「外部URLがリダイレクトに漏れないか」まで一本で検証できる。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock は vi.hoisted で先に生成する。
const {
  jar,
  exchangeMastodonCodeMock,
  getMastodonAccountMock,
  clearMastodonAppCredentialsMock,
  createSessionMock,
  getCurrentUserMock,
  instanceFindUnique,
  instanceCreate,
  userFindUnique,
  userUpdate,
  userCreate,
} = vi.hoisted(() => {
  const values = new Map<string, string>();
  const deleted: string[] = [];
  return {
    jar: {
      values,
      deleted,
      get: (name: string) =>
        values.has(name) ? { name, value: values.get(name)! } : undefined,
      delete: (name: string) => {
        deleted.push(name);
        values.delete(name);
      },
    },
    exchangeMastodonCodeMock: vi.fn(),
    getMastodonAccountMock: vi.fn(),
    clearMastodonAppCredentialsMock: vi.fn(),
    createSessionMock: vi.fn(),
    getCurrentUserMock: vi.fn(),
    instanceFindUnique: vi.fn(),
    instanceCreate: vi.fn(),
    userFindUnique: vi.fn(),
    userUpdate: vi.fn(),
    userCreate: vi.fn(),
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));

vi.mock("@/lib/auth/fediverse", () => ({
  exchangeMastodonCode: exchangeMastodonCodeMock,
  getMastodonAccount: getMastodonAccountMock,
}));

vi.mock("@/lib/auth/mastodonApp", () => ({
  clearMastodonAppCredentials: clearMastodonAppCredentialsMock,
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: createSessionMock,
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    instance: { findUnique: instanceFindUnique, create: instanceCreate },
    user: { findUnique: userFindUnique, update: userUpdate, create: userCreate },
  },
}));

import { GET } from "./route";
import { encryptOAuthSession, generateOAuthState } from "@/lib/auth/crypto";
import { LOGIN_REDIRECT_DEFAULT } from "@/lib/auth/loginRedirect";
import { decryptToken } from "@/lib/auth/tokens";

const BASE_URL = "https://shamezo.example";
const SERVER = "mastodon.example";
const PLAIN_TOKEN = "plain-access-token";

const INSTANCE = { id: "inst-1", domain: SERVER, type: "mastodon" };
const ACCOUNT = {
  id: "acct-1",
  username: "alice",
  displayName: "Alice",
  avatarUrl: "https://cdn.example/a.png",
};

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  jar.deleted.length = 0;

  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.NEXT_PUBLIC_APP_URL = BASE_URL;
  // 別ドメイン扱いにして /u/username@domain 形式を既定にする（同一なら /u/username）
  process.env.HOME_SERVER = "home.example";

  exchangeMastodonCodeMock.mockResolvedValue({
    accessToken: PLAIN_TOKEN,
    tokenType: "Bearer",
    scope: "read write",
    createdAt: 0,
  });
  getMastodonAccountMock.mockResolvedValue(ACCOUNT);
  getCurrentUserMock.mockResolvedValue(null);
  instanceFindUnique.mockResolvedValue(INSTANCE);
  userFindUnique.mockResolvedValue(null);
  userCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "user-1",
    ...data,
  }));
  userUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "user-1",
    ...data,
  }));
});

/** 有効な OAuth セッション cookie（既定は Mastodon・生成直後） */
function validSessionCookie(overrides: Partial<Parameters<typeof encryptOAuthSession>[0]> = {}) {
  return encryptOAuthSession({
    server: SERVER,
    clientId: "cid",
    clientSecret: "csecret",
    platform: "mastodon",
    createdAt: Date.now(),
    ...overrides,
  });
}

/** state / oauth_session cookie を揃えた「正常に流れる」前提を作る */
function primeCookies(callbackUrl = LOGIN_REDIRECT_DEFAULT): string {
  const state = generateOAuthState(callbackUrl);
  jar.values.set("oauth_state", state);
  jar.values.set("oauth_session", validSessionCookie());
  return state;
}

function req(params: Record<string, string>, headers: Record<string, string> = {}) {
  const url = new URL(`${BASE_URL}/api/auth/fediverse/callback/mastodon`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers });
}

function location(res: Response): string {
  return res.headers.get("location") ?? "";
}

describe("GET /api/auth/fediverse/callback/mastodon 入力検証", () => {
  it("インスタンス側で拒否（error付き）ならセッションを作らず oauth_denied", async () => {
    const res = await GET(req({ error: "access_denied" }));
    expect(location(res)).toBe(`${BASE_URL}/?error=oauth_denied`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("code が無ければ invalid_request", async () => {
    const state = primeCookies();
    const res = await GET(req({ state }));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_request`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("state が無ければ invalid_request", async () => {
    primeCookies();
    const res = await GET(req({ code: "auth-code" }));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_request`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/fediverse/callback/mastodon state検証（ログインCSRF）", () => {
  it("cookie の state と URL の state が食い違い、未ログインなら invalid_state", async () => {
    primeCookies();
    const res = await GET(req({ code: "auth-code", state: generateOAuthState() }));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_state`);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(exchangeMastodonCodeMock).not.toHaveBeenCalled();
  });

  it("cookie に state が無ければ invalid_state（未ログイン時）", async () => {
    jar.values.set("oauth_session", validSessionCookie());
    const res = await GET(req({ code: "auth-code", state: generateOAuthState() }));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_state`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("state の署名が壊れていれば expired_state（cookie と一致していても通さない）", async () => {
    const tampered = Buffer.from(
      JSON.stringify({ payload: JSON.stringify({ csrf: "x", timestamp: Date.now(), callbackUrl: LOGIN_REDIRECT_DEFAULT }), signature: "deadbeef" })
    ).toString("base64url");
    jar.values.set("oauth_state", tampered);
    jar.values.set("oauth_session", validSessionCookie());

    const res = await GET(req({ code: "auth-code", state: tampered }));
    expect(location(res)).toBe(`${BASE_URL}/?error=expired_state`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("重複コールバック（state不一致だが既ログイン）は成功先へ送るが、セッションは作り直さない", async () => {
    getCurrentUserMock.mockResolvedValue({
      username: "alice",
      instance: { domain: SERVER },
    });
    // cookie は1回目の成功で消えている状態＝unset
    const res = await GET(req({ code: "auth-code", state: generateOAuthState() }));

    expect(location(res)).toBe(`${BASE_URL}/u/alice@${SERVER}`);
    // ここでセッションを作るとログインCSRFの穴になるため、絶対に呼ばれてはいけない
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(exchangeMastodonCodeMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/fediverse/callback/mastodon OAuthセッション検証", () => {
  it("oauth_session cookie が無ければ session_expired", async () => {
    const state = generateOAuthState();
    jar.values.set("oauth_state", state);
    const res = await GET(req({ code: "auth-code", state }));
    expect(location(res)).toBe(`${BASE_URL}/?error=session_expired`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("platform が misskey のセッションは invalid_session（フロー取り違え防止）", async () => {
    const state = generateOAuthState();
    jar.values.set("oauth_state", state);
    jar.values.set("oauth_session", validSessionCookie({ platform: "misskey" }));
    const res = await GET(req({ code: "auth-code", state }));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_session`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("復号できないセッションは invalid_session", async () => {
    const state = generateOAuthState();
    jar.values.set("oauth_state", state);
    jar.values.set("oauth_session", "not-a-valid-ciphertext");
    const res = await GET(req({ code: "auth-code", state }));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_session`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("セッションが10分を超えていれば session_expired", async () => {
    const state = generateOAuthState();
    jar.values.set("oauth_state", state);
    jar.values.set(
      "oauth_session",
      validSessionCookie({ createdAt: Date.now() - 11 * 60 * 1000 })
    );
    const res = await GET(req({ code: "auth-code", state }));
    expect(location(res)).toBe(`${BASE_URL}/?error=session_expired`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/fediverse/callback/mastodon ログイン成功", () => {
  it("初回ログインはユーザーを作成し /create?welcome=1 へ", async () => {
    const state = primeCookies();
    const res = await GET(req({ code: "auth-code", state }));

    expect(location(res)).toBe(`${BASE_URL}/create?welcome=1`);
    expect(userCreate).toHaveBeenCalledOnce();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate.mock.calls[0][0].data).toMatchObject({
      instanceId: INSTANCE.id,
      remoteId: ACCOUNT.id,
      username: ACCOUNT.username,
      displayName: ACCOUNT.displayName,
      avatarUrl: ACCOUNT.avatarUrl,
    });
  });

  it("既存ユーザーは更新して自分のユーザーページへ", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    const state = primeCookies();
    const res = await GET(req({ code: "auth-code", state }));

    expect(location(res)).toBe(`${BASE_URL}/u/alice@${SERVER}`);
    expect(userUpdate).toHaveBeenCalledOnce();
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate.mock.calls[0][0].where).toEqual({ id: "user-1" });
  });

  it("HOME_SERVER と同一ドメインならユーザーページはドメインを省く", async () => {
    process.env.HOME_SERVER = SERVER;
    userFindUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    const state = primeCookies();
    const res = await GET(req({ code: "auth-code", state }));
    expect(location(res)).toBe(`${BASE_URL}/u/alice`);
  });

  it("アクセストークンは暗号化してから保存する（平文をDBへ渡さない）", async () => {
    const state = primeCookies();
    await GET(req({ code: "auth-code", state }));

    const saved = userCreate.mock.calls[0][0].data.accessToken as string;
    expect(saved).not.toBe(PLAIN_TOKEN);
    expect(decryptToken(saved)).toBe(PLAIN_TOKEN);
  });

  it("インスタンス未登録なら mastodon として作成する", async () => {
    instanceFindUnique.mockResolvedValue(null);
    instanceCreate.mockResolvedValue(INSTANCE);
    const state = primeCookies();
    await GET(req({ code: "auth-code", state }));

    expect(instanceCreate).toHaveBeenCalledWith({
      data: { domain: SERVER, type: "mastodon" },
    });
  });

  it("明示的な returnTo は尊重する", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    const state = primeCookies("/create");
    const res = await GET(req({ code: "auth-code", state }));
    expect(location(res)).toBe(`${BASE_URL}/create`);
  });

  it("state に外部URLが仕込まれていてもそこへは飛ばさない（オープンリダイレクト防止）", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    const state = primeCookies("https://evil.example/steal");
    const res = await GET(req({ code: "auth-code", state }));
    // sanitize されて既定センチネル扱い＝自分のユーザーページへ
    expect(location(res)).toBe(`${BASE_URL}/u/alice@${SERVER}`);
  });

  it("成功時に一時cookie（oauth_session / oauth_state）を削除する", async () => {
    const state = primeCookies();
    await GET(req({ code: "auth-code", state }));
    expect(jar.deleted).toContain("oauth_session");
    expect(jar.deleted).toContain("oauth_state");
  });

  it("createSession に identity とリクエスト情報（IP/UA）を渡す", async () => {
    const state = primeCookies();
    await GET(
      req(
        { code: "auth-code", state },
        { "cf-connecting-ip": "203.0.113.9", "user-agent": "TestAgent/1.0", "cf-ipcountry": "JP" }
      )
    );

    expect(createSessionMock).toHaveBeenCalledOnce();
    const [userId, instanceId, identity, requestInfo] = createSessionMock.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(instanceId).toBe(INSTANCE.id);
    expect(identity).toMatchObject({
      username: ACCOUNT.username,
      instanceDomain: SERVER,
      instanceType: "mastodon",
    });
    expect(requestInfo).toMatchObject({
      ipAddress: "203.0.113.9",
      userAgent: "TestAgent/1.0",
      country: "JP",
    });
  });

  it("トークン交換には cookie のクライアント資格情報と自前の redirect_uri を使う", async () => {
    const state = primeCookies();
    await GET(req({ code: "auth-code", state }));

    expect(exchangeMastodonCodeMock).toHaveBeenCalledWith(
      SERVER,
      "cid",
      "csecret",
      "auth-code",
      `${BASE_URL}/api/auth/fediverse/callback/mastodon`
    );
  });
});

describe("GET /api/auth/fediverse/callback/mastodon 失敗時", () => {
  it("invalid_client は保存済みアプリ資格情報を破棄して再登録に倒す", async () => {
    exchangeMastodonCodeMock.mockRejectedValue(
      new Error("トークン交換に失敗しました: {\"error\":\"invalid_client\"}")
    );
    const state = primeCookies();
    const res = await GET(req({ code: "auth-code", state }));

    expect(clearMastodonAppCredentialsMock).toHaveBeenCalledWith(SERVER);
    expect(location(res)).toBe(`${BASE_URL}/?error=app_invalid`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("invalid_client 以外のトークン交換失敗は資格情報を消さず auth_failed", async () => {
    exchangeMastodonCodeMock.mockRejectedValue(new Error("network unreachable"));
    const state = primeCookies();
    const res = await GET(req({ code: "auth-code", state }));

    expect(clearMastodonAppCredentialsMock).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${BASE_URL}/?error=auth_failed`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("ユーザー情報取得に失敗したら auth_failed（ユーザーを作らない）", async () => {
    getMastodonAccountMock.mockRejectedValue(new Error("401"));
    const state = primeCookies();
    const res = await GET(req({ code: "auth-code", state }));

    expect(location(res)).toBe(`${BASE_URL}/?error=auth_failed`);
    expect(userCreate).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
