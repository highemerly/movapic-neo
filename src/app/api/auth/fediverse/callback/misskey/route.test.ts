/**
 * Misskey MiAuth コールバック（GET /api/auth/fediverse/callback/misskey）の回帰テスト。
 *
 * Mastodon 版（../mastodon/route.test.ts）と守る不変条件は同じだが、検証の作りが違う:
 *   - state cookie ではなく「URLに載せた HMAC 署名＋タイムスタンプ」で改竄を弾く
 *   - そのうえで miauth_state cookie と sessionId を照合してログインCSRFを防ぐ
 *   - 検証の順序（署名 → cookie）自体が仕様。署名が通らないものは cookie を見るまでもない
 * よって「どの段でどのエラーへ落ちるか」を段ごとに固定する。
 *
 * 外部（Fediverse HTTP・DB・セッション発行・cookie）だけモックし、crypto / tokens /
 * loginRedirect は実物を通す＝暗号化とリダイレクト検証の配線まで一本で見る。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock は vi.hoisted で先に生成する。
const {
  jar,
  checkMisskeySessionMock,
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
    checkMisskeySessionMock: vi.fn(),
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
  checkMisskeySession: checkMisskeySessionMock,
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
import { generateMiAuthSignature } from "@/lib/auth/crypto";
import { decryptToken } from "@/lib/auth/tokens";

const BASE_URL = "https://shamezo.example";
const SERVER = "misskey.example";
const SESSION_ID = "0123456789abcdef0123456789abcdef";
const PLAIN_TOKEN = "plain-misskey-token";

const INSTANCE = { id: "inst-1", domain: SERVER, type: "misskey" };
const MISSKEY_USER = {
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

  checkMisskeySessionMock.mockResolvedValue({
    token: PLAIN_TOKEN,
    user: MISSKEY_USER,
  });
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

/** register 時にセットされる miauth_state cookie を再現する */
function primeCookie(sessionId = SESSION_ID) {
  jar.values.set("miauth_state", sessionId);
}

/** インスタンスから戻ってくるコールバックURLを、実物の署名付きで組み立てる */
function callbackParams(
  overrides: {
    server?: string;
    session?: string;
    ts?: number;
    sig?: string;
    redirect?: string;
  } = {}
) {
  const server = overrides.server ?? SERVER;
  const session = overrides.session ?? SESSION_ID;
  const ts = overrides.ts ?? Date.now();
  const sig = overrides.sig ?? generateMiAuthSignature(server, session, ts);
  const params: Record<string, string> = {
    server,
    session,
    ts: String(ts),
    sig,
  };
  if (overrides.redirect !== undefined) params.redirect = overrides.redirect;
  return params;
}

function req(params: Record<string, string>, headers: Record<string, string> = {}) {
  const url = new URL(`${BASE_URL}/api/auth/fediverse/callback/misskey`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, { headers });
}

function location(res: Response): string {
  return res.headers.get("location") ?? "";
}

describe("GET /api/auth/fediverse/callback/misskey 入力検証", () => {
  it.each(["server", "session", "ts", "sig"])(
    "%s が欠けていれば invalid_request",
    async (missing) => {
      primeCookie();
      const params = callbackParams();
      delete params[missing];
      const res = await GET(req(params));
      expect(location(res)).toBe(`${BASE_URL}/?error=invalid_request`);
      expect(createSessionMock).not.toHaveBeenCalled();
    }
  );

  it("ts が数値でなければ invalid_request", async () => {
    primeCookie();
    const res = await GET(req({ ...callbackParams(), ts: "not-a-number" }));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_request`);
    expect(checkMisskeySessionMock).not.toHaveBeenCalled();
  });

  it("ts が10分より古ければ expired_state", async () => {
    primeCookie();
    const res = await GET(req(callbackParams({ ts: Date.now() - 11 * 60 * 1000 })));
    expect(location(res)).toBe(`${BASE_URL}/?error=expired_state`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/fediverse/callback/misskey 署名検証", () => {
  it("署名が一致しなければ invalid_signature（cookieを見るまでもなく落とす）", async () => {
    primeCookie();
    const res = await GET(req(callbackParams({ sig: "f".repeat(64) })));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_signature`);
    expect(checkMisskeySessionMock).not.toHaveBeenCalled();
  });

  it("server を差し替えると署名が合わず invalid_signature（別サーバーへの誘導を防ぐ）", async () => {
    primeCookie();
    const params = callbackParams();
    params.server = "evil.example";
    const res = await GET(req(params));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_signature`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("sig の長さが違っても例外にせず invalid_signature", async () => {
    primeCookie();
    const res = await GET(req(callbackParams({ sig: "short" })));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_signature`);
  });
});

describe("GET /api/auth/fediverse/callback/misskey cookie照合（ログインCSRF）", () => {
  it("miauth_state cookie が無く未ログインなら invalid_state", async () => {
    const res = await GET(req(callbackParams()));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_state`);
    expect(checkMisskeySessionMock).not.toHaveBeenCalled();
  });

  it("cookie の sessionId と食い違えば invalid_state", async () => {
    primeCookie("別のセッションID");
    const res = await GET(req(callbackParams()));
    expect(location(res)).toBe(`${BASE_URL}/?error=invalid_state`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("重複コールバック（cookie無し・既ログイン）は成功先へ送るが、セッションは作り直さない", async () => {
    getCurrentUserMock.mockResolvedValue({
      username: "alice",
      instance: { domain: SERVER },
    });
    const res = await GET(req(callbackParams()));

    expect(location(res)).toBe(`${BASE_URL}/u/alice@${SERVER}`);
    // ここでセッションを作るとログインCSRFの穴になるため、絶対に呼ばれてはいけない
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(checkMisskeySessionMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/fediverse/callback/misskey ログイン成功", () => {
  it("初回ログインはユーザーを作成し /create?welcome=1 へ", async () => {
    primeCookie();
    const res = await GET(req(callbackParams()));

    expect(location(res)).toBe(`${BASE_URL}/create?welcome=1`);
    expect(userCreate).toHaveBeenCalledOnce();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate.mock.calls[0][0].data).toMatchObject({
      instanceId: INSTANCE.id,
      remoteId: MISSKEY_USER.id,
      username: MISSKEY_USER.username,
      displayName: MISSKEY_USER.displayName,
      avatarUrl: MISSKEY_USER.avatarUrl,
    });
  });

  it("既存ユーザーは更新して自分のユーザーページへ", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    primeCookie();
    const res = await GET(req(callbackParams()));

    expect(location(res)).toBe(`${BASE_URL}/u/alice@${SERVER}`);
    expect(userUpdate).toHaveBeenCalledOnce();
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate.mock.calls[0][0].where).toEqual({ id: "user-1" });
  });

  it("アクセストークンは暗号化してから保存する（平文をDBへ渡さない）", async () => {
    primeCookie();
    await GET(req(callbackParams()));

    const saved = userCreate.mock.calls[0][0].data.accessToken as string;
    expect(saved).not.toBe(PLAIN_TOKEN);
    expect(decryptToken(saved)).toBe(PLAIN_TOKEN);
  });

  it("インスタンス未登録なら misskey として作成する", async () => {
    instanceFindUnique.mockResolvedValue(null);
    instanceCreate.mockResolvedValue(INSTANCE);
    primeCookie();
    await GET(req(callbackParams()));

    expect(instanceCreate).toHaveBeenCalledWith({
      data: { domain: SERVER, type: "misskey" },
    });
  });

  it("明示的な redirect は尊重する", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    primeCookie();
    const res = await GET(req(callbackParams({ redirect: "/create" })));
    expect(location(res)).toBe(`${BASE_URL}/create`);
  });

  it("redirect に外部URLが仕込まれていてもそこへは飛ばさない（オープンリダイレクト防止）", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    primeCookie();
    const res = await GET(req(callbackParams({ redirect: "https://evil.example/steal" })));
    // sanitize されて既定センチネル扱い＝自分のユーザーページへ
    expect(location(res)).toBe(`${BASE_URL}/u/alice@${SERVER}`);
  });

  it("成功時に miauth_state cookie を削除する", async () => {
    primeCookie();
    await GET(req(callbackParams()));
    expect(jar.deleted).toContain("miauth_state");
  });

  it("MiAuth セッションの確認は URL の server / session で行う", async () => {
    primeCookie();
    await GET(req(callbackParams()));
    expect(checkMisskeySessionMock).toHaveBeenCalledWith(SERVER, SESSION_ID);
  });

  it("createSession に identity とリクエスト情報（IP/UA）を渡す", async () => {
    primeCookie();
    await GET(
      req(callbackParams(), {
        "cf-connecting-ip": "203.0.113.9",
        "user-agent": "TestAgent/1.0",
        "cf-ipcountry": "JP",
      })
    );

    expect(createSessionMock).toHaveBeenCalledOnce();
    const [userId, instanceId, identity, requestInfo] = createSessionMock.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(instanceId).toBe(INSTANCE.id);
    expect(identity).toMatchObject({
      username: MISSKEY_USER.username,
      instanceDomain: SERVER,
      instanceType: "misskey",
    });
    expect(requestInfo).toMatchObject({
      ipAddress: "203.0.113.9",
      userAgent: "TestAgent/1.0",
      country: "JP",
    });
  });
});

describe("GET /api/auth/fediverse/callback/misskey 失敗時", () => {
  it("MiAuth 未完了（checkMisskeySession が失敗）なら auth_failed でユーザーを作らない", async () => {
    checkMisskeySessionMock.mockRejectedValue(new Error("MiAuth認証が完了していません"));
    primeCookie();
    const res = await GET(req(callbackParams()));

    expect(location(res)).toBe(`${BASE_URL}/?error=auth_failed`);
    expect(userCreate).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("DB書き込みが失敗したら auth_failed（セッションは作らない）", async () => {
    userCreate.mockRejectedValue(new Error("db down"));
    primeCookie();
    const res = await GET(req(callbackParams()));

    expect(location(res)).toBe(`${BASE_URL}/?error=auth_failed`);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
