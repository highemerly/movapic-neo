/**
 * Fediverse 認証開始（POST /api/auth/fediverse/register）の回帰テスト。
 *
 * ここはログインフローの「入口」で、守るべきものが2つある:
 *   1. 受け入れポリシー（ALLOWED/DENIED/LOGIN_PLATFORM）が外部フェッチより前に効くこと。
 *      拒否サーバーの検出リクエストを飛ばしてしまうと、弾いたはずの相手に接続が漏れる。
 *   2. ここで発行した state / sessionId / 署名が、コールバック側の検証をそのまま通ること。
 *      発行と検証が別ファイルに分かれているため、片方だけ変えると本番でしか壊れない。
 *      よって本テストは crypto を実物のまま通し、コールバック側と同じ検証関数で往復を確認する。
 *
 * モックは外部境界（インスタンス検出のHTTP・アプリ登録・cookie）だけ。
 * normalizeServer / 認可URL生成 / serverPolicy / crypto は実物を通す。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock はファイル先頭へ巻き上げられるため、参照する mock は vi.hoisted で先に生成する。
const { jar, detectInstanceTypeMock, getOrRegisterMastodonAppMock } = vi.hoisted(() => {
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
    detectInstanceTypeMock: vi.fn(),
    getOrRegisterMastodonAppMock: vi.fn(),
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));

// detectInstanceType（外部への検出フェッチ）だけ差し替え、normalizeServer と
// 認可URL生成は実物を使う＝生成されるURLの中身まで検証できる
vi.mock("@/lib/auth/fediverse", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/fediverse")>();
  return { ...actual, detectInstanceType: detectInstanceTypeMock };
});

vi.mock("@/lib/auth/mastodonApp", () => ({
  getOrRegisterMastodonApp: getOrRegisterMastodonAppMock,
}));

import { POST } from "./route";
import { decryptOAuthSession, verifyOAuthState, verifyMiAuthSignature } from "@/lib/auth/crypto";
import { AppError } from "@/lib/errors/AppError";
import { ErrorCodes } from "@/lib/errors/codes";

const BASE_URL = "https://shamezo.example";
const MASTODON = "mastodon.example";
const MISSKEY = "misskey.example";

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  jar.options.clear();
  jar.deleted.length = 0;

  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.NEXT_PUBLIC_APP_URL = BASE_URL;
  // ポリシー系envはテストごとに明示する。残留すると別テストの結果を変えるため既定は未設定。
  delete process.env.ALLOWED_SERVERS;
  delete process.env.DENIED_SERVERS;
  delete process.env.LOGIN_PLATFORM;

  detectInstanceTypeMock.mockResolvedValue({ type: "mastodon", domain: MASTODON });
  getOrRegisterMastodonAppMock.mockResolvedValue({
    clientId: "client-id-1",
    clientSecret: "client-secret-1",
  });
});

function req(body: unknown) {
  return new NextRequest(`${BASE_URL}/api/auth/fediverse/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type ApiBody = {
  success?: boolean;
  url?: string;
  platform?: string;
  server?: string;
  error?: { code: string; message: string; suggestion?: string };
};

async function json(res: Response): Promise<ApiBody> {
  return res.json();
}

describe("POST /api/auth/fediverse/register 入力検証", () => {
  it("server が無ければ 400（検出フェッチを飛ばさない）", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe(ErrorCodes.VALIDATION_REQUIRED);
    expect(detectInstanceTypeMock).not.toHaveBeenCalled();
  });

  it("server が文字列でなければ 400", async () => {
    const res = await POST(req({ server: 123 }));
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe(ErrorCodes.VALIDATION_REQUIRED);
  });

  it("JSONとして壊れたボディは 500（内部エラー扱い）", async () => {
    const broken = new NextRequest(`${BASE_URL}/api/auth/fediverse/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const res = await POST(broken);
    expect(res.status).toBe(500);
    expect((await json(res)).error?.code).toBe(ErrorCodes.INTERNAL_ERROR);
  });

  it("サーバー名は正規化してから扱う（プロトコル/大文字/末尾スラッシュ）", async () => {
    const res = await POST(req({ server: "https://Mastodon.Example/" }));
    expect(detectInstanceTypeMock).toHaveBeenCalledWith(MASTODON);
    expect((await json(res)).server).toBe(MASTODON);
  });
});

describe("POST /api/auth/fediverse/register 受け入れポリシー", () => {
  it("ALLOWED_SERVERS 外は 403（検出フェッチより前に弾く）", async () => {
    process.env.ALLOWED_SERVERS = "allowed.example";
    const res = await POST(req({ server: MASTODON }));

    expect(res.status).toBe(403);
    expect((await json(res)).error?.code).toBe(ErrorCodes.SERVER_NOT_ALLOWED);
    expect(detectInstanceTypeMock).not.toHaveBeenCalled();
  });

  it("ALLOWED_SERVERS 内なら通る", async () => {
    process.env.ALLOWED_SERVERS = `${MASTODON},other.example`;
    const res = await POST(req({ server: MASTODON }));
    expect(res.status).toBe(200);
  });

  it("DENIED_SERVERS は 403 で、拒否相手へ接続しない（外部フェッチ前に判定）", async () => {
    process.env.DENIED_SERVERS = MASTODON;
    const res = await POST(req({ server: MASTODON }));

    expect(res.status).toBe(403);
    expect((await json(res)).error?.code).toBe(ErrorCodes.SERVER_NOT_ALLOWED);
    expect(detectInstanceTypeMock).not.toHaveBeenCalled();
  });

  it("LOGIN_PLATFORM=misskey のとき Mastodon は 403（Misskeyへ誘導する）", async () => {
    process.env.LOGIN_PLATFORM = "misskey";
    const res = await POST(req({ server: MASTODON }));

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error?.message).toBe("Mastodonは現在サポートされていません");
    expect(body.error?.suggestion).toBe("Misskeyのサーバーでログインしてください");
  });

  it("LOGIN_PLATFORM=mastodon のとき Misskey は 403（Mastodonへ誘導する）", async () => {
    process.env.LOGIN_PLATFORM = "mastodon";
    detectInstanceTypeMock.mockResolvedValue({ type: "misskey", domain: MISSKEY });
    const res = await POST(req({ server: MISSKEY }));

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error?.message).toBe("Misskeyは現在サポートされていません");
    expect(body.error?.suggestion).toBe("Mastodonのサーバーでログインしてください");
  });

  it("種類を判別できないインスタンスは 400", async () => {
    detectInstanceTypeMock.mockResolvedValue({ type: "unknown", domain: "unknown.example" });
    const res = await POST(req({ server: "unknown.example" }));

    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe(ErrorCodes.VALIDATION_INVALID);
  });
});

describe("POST /api/auth/fediverse/register Mastodon", () => {
  it("認可URLに client_id と state を載せて返す", async () => {
    const res = await POST(req({ server: MASTODON }));
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.platform).toBe("mastodon");

    const url = new URL(body.url!);
    expect(url.origin + url.pathname).toBe(`https://${MASTODON}/oauth/authorize`);
    expect(url.searchParams.get("client_id")).toBe("client-id-1");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${BASE_URL}/api/auth/fediverse/callback/mastodon`
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("cookie の state と認可URLの state が一致する（コールバックの照合が成立する前提）", async () => {
    const res = await POST(req({ server: MASTODON }));
    const url = new URL((await json(res)).url!);

    expect(jar.values.get("oauth_state")).toBe(url.searchParams.get("state"));
  });

  it("state には callbackUrl が載り、コールバック側の検証関数で復元できる", async () => {
    const res = await POST(req({ server: MASTODON, callbackUrl: "/create" }));
    const state = new URL((await json(res)).url!).searchParams.get("state")!;

    expect(verifyOAuthState(state)?.callbackUrl).toBe("/create");
  });

  it("callbackUrl 未指定なら既定センチネル /dashboard", async () => {
    const res = await POST(req({ server: MASTODON }));
    const state = new URL((await json(res)).url!).searchParams.get("state")!;

    expect(verifyOAuthState(state)?.callbackUrl).toBe("/dashboard");
  });

  it("clientSecret は暗号化して cookie に入れる（平文で置かない）", async () => {
    await POST(req({ server: MASTODON }));

    const raw = jar.values.get("oauth_session")!;
    expect(raw).not.toContain("client-secret-1");
    expect(decryptOAuthSession(raw)).toMatchObject({
      server: MASTODON,
      clientId: "client-id-1",
      clientSecret: "client-secret-1",
      platform: "mastodon",
    });
  });

  it("一時cookie は HttpOnly / SameSite=lax / 10分で発行する", async () => {
    await POST(req({ server: MASTODON }));

    for (const name of ["oauth_session", "oauth_state"]) {
      expect(jar.options.get(name)).toMatchObject({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      });
    }
  });

  it("アプリ登録は正規化済みドメインと自前の redirect_uri で行う", async () => {
    await POST(req({ server: "https://Mastodon.Example" }));

    expect(getOrRegisterMastodonAppMock).toHaveBeenCalledWith(
      MASTODON,
      `${BASE_URL}/api/auth/fediverse/callback/mastodon`
    );
  });
});

describe("POST /api/auth/fediverse/register Misskey", () => {
  beforeEach(() => {
    detectInstanceTypeMock.mockResolvedValue({ type: "misskey", domain: MISSKEY });
  });

  it("MiAuth URL を返し、sessionId を cookie にバインドする", async () => {
    const res = await POST(req({ server: MISSKEY }));
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.platform).toBe("misskey");

    const url = new URL(body.url!);
    const sessionId = url.pathname.replace("/miauth/", "");
    expect(url.origin).toBe(`https://${MISSKEY}`);
    expect(sessionId).toBeTruthy();
    // コールバックはこの cookie と URL の session を照合してログインCSRFを防ぐ
    expect(jar.values.get("miauth_state")).toBe(sessionId);
    expect(jar.options.get("miauth_state")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
  });

  it("Mastodon 用の一時cookie は発行しない", async () => {
    await POST(req({ server: MISSKEY }));
    expect(jar.values.has("oauth_session")).toBe(false);
    expect(jar.values.has("oauth_state")).toBe(false);
  });

  it("コールバックURLの署名が、コールバック側の検証をそのまま通る（発行↔検証の往復）", async () => {
    const res = await POST(req({ server: MISSKEY }));
    const callback = new URL(
      new URL((await json(res)).url!).searchParams.get("callback")!
    );

    const server = callback.searchParams.get("server")!;
    const session = callback.searchParams.get("session")!;
    const ts = Number(callback.searchParams.get("ts"));
    const sig = callback.searchParams.get("sig")!;

    expect(server).toBe(MISSKEY);
    expect(session).toBe(jar.values.get("miauth_state"));
    expect(verifyMiAuthSignature(server, session, ts, sig)).toBe(true);
  });

  it("callbackUrl は redirect パラメータとして往復する", async () => {
    const res = await POST(req({ server: MISSKEY, callbackUrl: "/create" }));
    const callback = new URL(
      new URL((await json(res)).url!).searchParams.get("callback")!
    );
    expect(callback.searchParams.get("redirect")).toBe("/create");
  });

  it("必要な権限（投稿・ドライブ・リアクション）を要求する", async () => {
    const res = await POST(req({ server: MISSKEY }));
    const permission = new URL((await json(res)).url!).searchParams.get("permission")!;

    expect(permission.split(",")).toEqual(
      expect.arrayContaining(["read:account", "write:notes", "write:drive", "write:reactions"])
    );
  });
});

describe("POST /api/auth/fediverse/register 失敗時", () => {
  it("NEXT_PUBLIC_APP_URL 未設定は 500（誤った redirect_uri を発行しない）", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const res = await POST(req({ server: MASTODON }));

    expect(res.status).toBe(500);
    expect((await json(res)).error?.code).toBe(ErrorCodes.INTERNAL_ERROR);
    expect(getOrRegisterMastodonAppMock).not.toHaveBeenCalled();
  });

  it("検出時の AppError は、そのステータスとメッセージで返す", async () => {
    detectInstanceTypeMock.mockRejectedValue(
      new AppError(
        ErrorCodes.VALIDATION_INVALID,
        "サーバーが見つかりません",
        400,
        "サーバー名を確認してください"
      )
    );
    const res = await POST(req({ server: "typo.example" }));

    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.code).toBe(ErrorCodes.VALIDATION_INVALID);
    expect(body.error?.message).toBe("サーバーが見つかりません");
    expect(body.error?.suggestion).toBe("サーバー名を確認してください");
  });

  it("未知のエラーは 500 に丸める（内部情報を漏らさない）", async () => {
    detectInstanceTypeMock.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:443"));
    const res = await POST(req({ server: MASTODON }));

    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error?.code).toBe(ErrorCodes.INTERNAL_ERROR);
    expect(body.error?.message).toBe("処理中にエラーが発生しました");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });
});
