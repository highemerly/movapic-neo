import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import {
  encryptOAuthSession,
  decryptOAuthSession,
  generateOAuthState,
  verifyOAuthState,
  generateMiAuthSignature,
  verifyMiAuthSignature,
  verifyRequestSignature,
  hashRequestBody,
  sanitizeRedirectUrl,
  type OAuthSessionData,
} from "./crypto";

const SECRET = "test-jwt-secret-value";

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

const sessionData = (): OAuthSessionData => ({
  server: "mastodon.example",
  clientId: "cid",
  clientSecret: "csecret",
  platform: "mastodon",
  createdAt: 1_700_000_000_000,
});

describe("encryptOAuthSession / decryptOAuthSession", () => {
  it("暗号化→復号でオブジェクトが一致する", () => {
    const data = sessionData();
    expect(decryptOAuthSession(encryptOAuthSession(data))).toEqual(data);
  });

  it("不正な入力は null（例外を投げない）", () => {
    expect(decryptOAuthSession("")).toBeNull();
    expect(decryptOAuthSession("not-base64url!!")).toBeNull();
    expect(decryptOAuthSession("aGVsbG8")).toBeNull(); // 短すぎてiv/tag分離不可
  });

  it("別のシークレットでは復号できず null", () => {
    const enc = encryptOAuthSession(sessionData());
    process.env.JWT_SECRET = "another-secret";
    expect(decryptOAuthSession(enc)).toBeNull();
  });
});

describe("generateOAuthState / verifyOAuthState", () => {
  it("生成→検証で callbackUrl/csrf が復元される", () => {
    const st = verifyOAuthState(generateOAuthState("/create"));
    expect(st?.callbackUrl).toBe("/create");
    expect(st?.csrf).toMatch(/^[0-9a-f]{32}$/);
    expect(typeof st?.timestamp).toBe("number");
  });

  it("callbackUrl 既定は /dashboard", () => {
    expect(verifyOAuthState(generateOAuthState())?.callbackUrl).toBe("/dashboard");
  });

  it("署名を改竄すると null（HMAC不一致）", () => {
    const state = generateOAuthState("/x");
    const obj = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      payload: string;
      signature: string;
    };
    // 署名の先頭1文字を別のhexへ（長さは維持＝length checkは通し timingSafeEqual で落とす）
    obj.signature = (obj.signature[0] === "a" ? "b" : "a") + obj.signature.slice(1);
    const tampered = Buffer.from(JSON.stringify(obj)).toString("base64url");
    expect(verifyOAuthState(tampered)).toBeNull();
  });

  it("ペイロードを差し替えると null（署名が合わない）", () => {
    const state = generateOAuthState("/x");
    const obj = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      payload: string;
      signature: string;
    };
    obj.payload = obj.payload.replace("/x", "/evil"); // 署名はそのまま
    const tampered = Buffer.from(JSON.stringify(obj)).toString("base64url");
    expect(verifyOAuthState(tampered)).toBeNull();
  });

  it("ゴミ入力は null", () => {
    expect(verifyOAuthState("garbage")).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
  });

  describe("有効期限", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("maxAge 超過で null、範囲内なら復元", () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const state = generateOAuthState("/y");

      vi.advanceTimersByTime(11 * 60 * 1000); // 既定10分を超過
      expect(verifyOAuthState(state)).toBeNull();

      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const fresh = generateOAuthState("/z");
      vi.advanceTimersByTime(5 * 60 * 1000); // 範囲内
      expect(verifyOAuthState(fresh)?.callbackUrl).toBe("/z");
    });
  });
});

describe("MiAuth 署名", () => {
  it("同じ入力で決定的、検証が通る", () => {
    const s1 = generateMiAuthSignature("misskey.example", "sid", 1000);
    const s2 = generateMiAuthSignature("misskey.example", "sid", 1000);
    expect(s1).toBe(s2);
    expect(verifyMiAuthSignature("misskey.example", "sid", 1000, s1)).toBe(true);
  });

  it("入力が1つでも違えば検証は false", () => {
    const sig = generateMiAuthSignature("misskey.example", "sid", 1000);
    expect(verifyMiAuthSignature("misskey.example", "sid", 1001, sig)).toBe(false);
    expect(verifyMiAuthSignature("other.example", "sid", 1000, sig)).toBe(false);
    expect(verifyMiAuthSignature("misskey.example", "sid", 1000, "deadbeef")).toBe(false);
  });
});

describe("verifyRequestSignature", () => {
  const sign = (ts: number, hash: string, secret: string) =>
    createHmac("sha256", secret).update(`${ts}:${hash}`).digest("hex");

  it("正しい署名かつ時刻が範囲内なら true", () => {
    const ts = Date.now();
    const hash = hashRequestBody(Buffer.from("body"));
    expect(verifyRequestSignature(ts, hash, sign(ts, hash, "k"), "k")).toBe(true);
  });

  it("古すぎる/未来すぎる時刻はリプレイ防止で false", () => {
    const hash = hashRequestBody(Buffer.from("body"));
    const old = Date.now() - 10 * 60 * 1000;
    const future = Date.now() + 10 * 60 * 1000;
    expect(verifyRequestSignature(old, hash, sign(old, hash, "k"), "k")).toBe(false);
    expect(verifyRequestSignature(future, hash, sign(future, hash, "k"), "k")).toBe(false);
  });

  it("署名が違えば false", () => {
    const ts = Date.now();
    const hash = hashRequestBody(Buffer.from("body"));
    expect(verifyRequestSignature(ts, hash, sign(ts, hash, "wrong-key"), "k")).toBe(false);
    expect(verifyRequestSignature(ts, hash, "short", "k")).toBe(false);
  });
});

describe("hashRequestBody", () => {
  it("既知のSHA-256ベクトル", () => {
    expect(hashRequestBody(Buffer.from(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(hashRequestBody(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("sanitizeRedirectUrl（オープンリダイレクト防止）", () => {
  it("安全な相対パスはそのまま（前後空白はトリム）", () => {
    expect(sanitizeRedirectUrl("/create")).toBe("/create");
    expect(sanitizeRedirectUrl("/u/alice?tab=posts#top")).toBe("/u/alice?tab=posts#top");
    expect(sanitizeRedirectUrl("  /foo  ")).toBe("/foo");
  });

  it("null/undefined/空は既定パスへ", () => {
    expect(sanitizeRedirectUrl(null)).toBe("/dashboard");
    expect(sanitizeRedirectUrl(undefined)).toBe("/dashboard");
    expect(sanitizeRedirectUrl("")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("   ")).toBe("/dashboard");
  });

  it("外部URL・プロトコル・プロトコル相対を拒否", () => {
    for (const bad of [
      "http://evil.com",
      "https://evil.com",
      "//evil.com",
      "javascript:alert(1)",
      "mailto:a@b.com",
      "data:text/html,x",
    ]) {
      expect(sanitizeRedirectUrl(bad)).toBe("/dashboard");
    }
  });

  it("スラッシュ始まりでない・バックスラッシュ・パストラバーサル・制御文字を拒否", () => {
    expect(sanitizeRedirectUrl("dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("/foo\\bar")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("/../etc/passwd")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("/foo/../../bar")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("/foo\x00bar")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("/foo\nbar")).toBe("/dashboard");
  });

  it("既定パスは差し替え可能", () => {
    expect(sanitizeRedirectUrl(null, "/")).toBe("/");
    expect(sanitizeRedirectUrl("http://x", "/login")).toBe("/login");
  });
});
