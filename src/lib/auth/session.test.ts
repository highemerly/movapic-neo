/**
 * セッション管理（JWT）のユニットテスト。
 *
 * jose は実物のまま使い、cookie（next/headers）と prisma だけモックする。
 * 「createSession が発行したトークンを getSessionClaims が読める」というラウンドトリップを
 * 本物の署名・検証で通すため、発行側と検証側の取り違え（alg・秘密鍵・ペイロード形）は
 * ここで必ず落ちる。
 *
 * 併せて、この層が担うセキュリティ上の約束を固定する:
 *   - JWT には識別/表示用フィールドしか入れない（accessToken 等の機密は絶対に載せない）
 *   - 検証は HS256 にピン（alg 混同・alg:none を拒否）
 *   - fail-closed: LoginSession が失効/不在なら未認証扱い（jti + revokedAt:null で絞る）
 *   - 失効操作は必ず userId でスコープする（他人のセッションを触れない＝IDOR対策）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock は vi.hoisted で先に生成する。
const {
  jar,
  loginSessionCreate,
  loginSessionDeleteMany,
  loginSessionUpdateMany,
  userFindFirst,
} = vi.hoisted(() => {
  const values = new Map<string, string>();
  const options = new Map<string, Record<string, unknown>>();
  const deleted: string[] = [];
  return {
    jar: {
      values,
      options,
      deleted,
      get: (name: string) =>
        values.has(name) ? { name, value: values.get(name)! } : undefined,
      set: (name: string, value: string, opts: Record<string, unknown> = {}) => {
        values.set(name, value);
        options.set(name, opts);
      },
      delete: (name: string) => {
        deleted.push(name);
        values.delete(name);
      },
    },
    loginSessionCreate: vi.fn(),
    loginSessionDeleteMany: vi.fn(),
    loginSessionUpdateMany: vi.fn(),
    userFindFirst: vi.fn(),
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));

vi.mock("@/lib/db", () => ({
  default: {
    loginSession: {
      create: loginSessionCreate,
      deleteMany: loginSessionDeleteMany,
      updateMany: loginSessionUpdateMany,
    },
    user: { findFirst: userFindFirst },
  },
}));

import {
  createSession,
  deleteSessionCookie,
  getSessionClaims,
  getCurrentUser,
  getCurrentUserWithValidation,
  getCurrentUserWithPreferences,
  getCurrentSessionJti,
  revokeSession,
  revokeOtherSessions,
  type SessionIdentity,
  type LoginRequestInfo,
} from "./session";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./sessionConstants";

const SECRET = "test-jwt-secret";
const USER_ID = "user-1";
const INSTANCE_ID = "inst-1";

const IDENTITY: SessionIdentity = {
  username: "alice",
  displayName: "Alice",
  avatarUrl: "https://cdn.example/a.png",
  instanceDomain: "mastodon.example",
  instanceType: "mastodon",
};

const REQUEST_INFO: LoginRequestInfo = {
  ipAddress: "203.0.113.9",
  userAgent: "TestAgent/1.0",
  country: "JP",
  region: "Tokyo",
  city: "Chiyoda",
};

const INSTANCE = { id: INSTANCE_ID, domain: "mastodon.example", type: "mastodon" };

/** prisma.user.findFirst が返す行（include: instance 込み） */
function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: "alice",
    displayName: "Alice",
    avatarUrl: "https://cdn.example/a.png",
    emailPrefix: "prefix-1",
    instanceId: INSTANCE_ID,
    instance: INSTANCE,
    accessToken: "encrypted-token",
    autoMakeup: true,
    defaultPosition: "bottom",
    defaultFont: "gothic",
    defaultColor: "white",
    defaultSize: "medium",
    defaultArrangement: "single",
    defaultVisibility: "public",
    defaultCameraOption: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  jar.options.clear();
  jar.deleted.length = 0;

  process.env.JWT_SECRET = SECRET;
  loginSessionCreate.mockResolvedValue({});
  loginSessionDeleteMany.mockResolvedValue({ count: 0 });
});

/** createSession を1回通し、発行された jti を返す */
async function login(): Promise<string> {
  await createSession(USER_ID, INSTANCE_ID, IDENTITY, REQUEST_INFO);
  return loginSessionCreate.mock.calls[0][0].data.jti as string;
}

/** cookie に入っている JWT のペイロードを（検証せずに）読む */
function decodePayload(): Record<string, unknown> {
  const token = jar.values.get(SESSION_COOKIE_NAME)!;
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

describe("createSession", () => {
  it("セッションCookieを HttpOnly / SameSite=lax / 7日で設定する", async () => {
    await login();

    expect(jar.values.get(SESSION_COOKIE_NAME)).toBeTruthy();
    expect(jar.options.get(SESSION_COOKIE_NAME)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
  });

  it("発行したトークンを getSessionClaims が読み戻せる（発行↔検証の往復）", async () => {
    const jti = await login();

    expect(await getSessionClaims()).toEqual({
      userId: USER_ID,
      instanceId: INSTANCE_ID,
      jti,
      username: IDENTITY.username,
      displayName: IDENTITY.displayName,
      avatarUrl: IDENTITY.avatarUrl,
      instanceDomain: IDENTITY.instanceDomain,
      instanceType: IDENTITY.instanceType,
    });
  });

  it("JWT の jti と LoginSession の jti が一致する（DB照合が成立する前提）", async () => {
    const jti = await login();
    expect(decodePayload().jti).toBe(jti);
  });

  it("ログイン履歴にリクエスト情報を記録する", async () => {
    await login();

    expect(loginSessionCreate).toHaveBeenCalledOnce();
    expect(loginSessionCreate.mock.calls[0][0].data).toMatchObject({
      userId: USER_ID,
      ipAddress: REQUEST_INFO.ipAddress,
      userAgent: REQUEST_INFO.userAgent,
      country: REQUEST_INFO.country,
      region: REQUEST_INFO.region,
      city: REQUEST_INFO.city,
    });
  });

  it("JWT には識別/表示用フィールドしか入れない（機密値を載せない）", async () => {
    await login();

    // 想定外のキーが増えたらここで気づく＝機密値の混入を検知するための固定
    expect(Object.keys(decodePayload()).sort()).toEqual([
      "avatarUrl",
      "displayName",
      "exp",
      "iat",
      "instanceDomain",
      "instanceId",
      "instanceType",
      "jti",
      "sat",
      "userId",
      "username",
    ]);
  });

  it("sat（セッション開始の絶対時刻）を秒で埋める（90日上限の判定に使う）", async () => {
    const before = Math.floor(Date.now() / 1000);
    await login();
    const sat = decodePayload().sat as number;

    expect(sat).toBeGreaterThanOrEqual(before);
    expect(sat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it("保持期間（90日）を超えた履歴を、本人分だけ削除する", async () => {
    await login();

    expect(loginSessionDeleteMany).toHaveBeenCalledOnce();
    const where = loginSessionDeleteMany.mock.calls[0][0].where;
    expect(where.userId).toBe(USER_ID);

    const cutoff = where.createdAt.lt as Date;
    const expected = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5_000);
  });

  it("JWT_SECRET 未設定なら発行しない（署名なしCookieを置かない）", async () => {
    delete process.env.JWT_SECRET;

    await expect(
      createSession(USER_ID, INSTANCE_ID, IDENTITY, REQUEST_INFO)
    ).rejects.toThrow("JWT_SECRET");
    expect(jar.values.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(loginSessionCreate).not.toHaveBeenCalled();
  });
});

describe("getSessionClaims（DBレス検証）", () => {
  it("Cookie が無ければ null", async () => {
    expect(await getSessionClaims()).toBeNull();
  });

  it("別の秘密鍵で署名されたトークンは null", async () => {
    await login();
    process.env.JWT_SECRET = "another-secret";

    expect(await getSessionClaims()).toBeNull();
  });

  it("期限切れのトークンは null", async () => {
    const expired = await new SignJWT({ userId: USER_ID, jti: "j" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    jar.set(SESSION_COOKIE_NAME, expired);

    expect(await getSessionClaims()).toBeNull();
  });

  it("HS256 以外で署名されたトークンは拒否する（algピンの回帰ガード）", async () => {
    // jwtVerify から algorithms:["HS256"] を外すと、同じ秘密鍵で署名した HS512 が
    // 通ってしまう＝ヘッダー側が alg を選べる状態に戻る。このテストだけがそれを検知する
    // （alg:none は jose が常に拒否するため、ピンの有無を判別できない）。
    const hs512 = await new SignJWT({ userId: USER_ID, jti: "forged" })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    jar.set(SESSION_COOKIE_NAME, hs512);

    expect(await getSessionClaims()).toBeNull();
  });

  it("alg:none のトークンは拒否する", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ userId: USER_ID, jti: "forged", exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    jar.set(SESSION_COOKIE_NAME, `${header}.${payload}.`);

    expect(await getSessionClaims()).toBeNull();
  });

  it("ペイロードを差し替えたトークンは null（署名不一致）", async () => {
    await login();
    const [header, , signature] = jar.values.get(SESSION_COOKIE_NAME)!.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...decodePayload(), userId: "someone-else" })
    ).toString("base64url");
    jar.set(SESSION_COOKIE_NAME, `${header}.${forged}.${signature}`);

    expect(await getSessionClaims()).toBeNull();
  });

  it("DBには一切問い合わせない（表示系をDBレスに保つ）", async () => {
    await login();
    await getSessionClaims();

    expect(userFindFirst).not.toHaveBeenCalled();
  });
});

describe("getCurrentUser（DB失効チェック付き）", () => {
  it("Cookie が無ければ null（DBを触らない）", async () => {
    expect(await getCurrentUser()).toBeNull();
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("ユーザー存在と未失効セッションを1クエリで絞る（fail-closed）", async () => {
    const jti = await login();
    userFindFirst.mockResolvedValue(dbUser());

    await getCurrentUser();

    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        id: USER_ID,
        loginSessions: { some: { jti, revokedAt: null } },
      },
      include: { instance: true },
    });
  });

  it("該当行が無い（失効/ユーザー削除）なら null", async () => {
    await login();
    userFindFirst.mockResolvedValue(null);

    expect(await getCurrentUser()).toBeNull();
  });

  it("取得できたら SessionUser を返し、accessToken は含めない", async () => {
    await login();
    userFindFirst.mockResolvedValue(dbUser());

    const user = await getCurrentUser();

    expect(user).toEqual({
      id: USER_ID,
      username: "alice",
      displayName: "Alice",
      avatarUrl: "https://cdn.example/a.png",
      emailPrefix: "prefix-1",
      instanceId: INSTANCE_ID,
      instance: INSTANCE,
    });
    expect(user).not.toHaveProperty("accessToken");
  });
});

describe("getCurrentUserWithValidation", () => {
  it("accessToken と autoMakeup を含めて返す", async () => {
    await login();
    userFindFirst.mockResolvedValue(dbUser());

    const user = await getCurrentUserWithValidation();

    expect(user).toMatchObject({
      id: USER_ID,
      accessToken: "encrypted-token",
      autoMakeup: true,
      instance: INSTANCE,
    });
  });

  it("セッションが失効していれば null（トークンを渡さない）", async () => {
    await login();
    userFindFirst.mockResolvedValue(null);

    expect(await getCurrentUserWithValidation()).toBeNull();
  });

  it("Cookie が無ければ DB を触らずに null", async () => {
    expect(await getCurrentUserWithValidation()).toBeNull();
    expect(userFindFirst).not.toHaveBeenCalled();
  });
});

describe("getCurrentUserWithPreferences", () => {
  it("defaultX スカラーを preferences にまとめて返す", async () => {
    await login();
    userFindFirst.mockResolvedValue(dbUser());

    const user = await getCurrentUserWithPreferences();

    expect(user).toMatchObject({
      id: USER_ID,
      instanceDomain: INSTANCE.domain,
      instanceType: INSTANCE.type,
      preferences: {
        position: "bottom",
        font: "gothic",
        color: "white",
        size: "medium",
        arrangement: "single",
        visibility: "public",
        cameraOption: null,
      },
    });
  });

  it("未設定の preferences は null のまま返す（UI側でフォールバックする前提）", async () => {
    await login();
    userFindFirst.mockResolvedValue(
      dbUser({ defaultPosition: null, defaultFont: null, defaultVisibility: null })
    );

    const user = await getCurrentUserWithPreferences();

    expect(user!.preferences).toMatchObject({
      position: null,
      font: null,
      visibility: null,
    });
  });

  it("セッションが失効していれば null", async () => {
    await login();
    userFindFirst.mockResolvedValue(null);

    expect(await getCurrentUserWithPreferences()).toBeNull();
  });
});

describe("getCurrentSessionJti", () => {
  it("現在のセッションの jti を DB 問い合わせなしで返す", async () => {
    const jti = await login();

    expect(await getCurrentSessionJti()).toBe(jti);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("Cookie が無ければ null", async () => {
    expect(await getCurrentSessionJti()).toBeNull();
  });
});

describe("revokeSession", () => {
  it("必ず userId でスコープして失効させる（他人のセッションを触れない＝IDOR対策）", async () => {
    loginSessionUpdateMany.mockResolvedValue({ count: 1 });

    const ok = await revokeSession(USER_ID, "sess-1");

    expect(ok).toBe(true);
    expect(loginSessionUpdateMany).toHaveBeenCalledOnce();
    expect(loginSessionUpdateMany.mock.calls[0][0].where).toEqual({
      id: "sess-1",
      userId: USER_ID,
      revokedAt: null,
    });
    expect(loginSessionUpdateMany.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it("対象が無い（他人のもの・失効済み含む）なら false", async () => {
    loginSessionUpdateMany.mockResolvedValue({ count: 0 });

    expect(await revokeSession(USER_ID, "sess-1")).toBe(false);
  });
});

describe("revokeOtherSessions", () => {
  it("現在の jti を除外し、本人の未失効セッションだけ失効させる", async () => {
    loginSessionUpdateMany.mockResolvedValue({ count: 3 });

    const count = await revokeOtherSessions(USER_ID, "current-jti");

    expect(count).toBe(3);
    expect(loginSessionUpdateMany.mock.calls[0][0].where).toEqual({
      userId: USER_ID,
      revokedAt: null,
      jti: { not: "current-jti" },
    });
  });
});

describe("deleteSessionCookie", () => {
  it("セッションCookieを削除する", async () => {
    await login();
    await deleteSessionCookie();

    expect(jar.deleted).toContain(SESSION_COOKIE_NAME);
    expect(await getSessionClaims()).toBeNull();
  });
});
