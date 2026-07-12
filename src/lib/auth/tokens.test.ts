import { describe, it, expect, beforeEach } from "vitest";
import { encryptToken, decryptToken, generateEncryptionKey } from "./tokens";

// 32バイト(=64 hex文字)の鍵。AES-256-GCM 用。
const KEY = "0".repeat(64);

describe("encryptToken / decryptToken", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });

  it("暗号化→復号でもとに戻る（各種文字列）", () => {
    for (const s of ["", "hello", "日本語トークン🔒", "a".repeat(2000)]) {
      expect(decryptToken(encryptToken(s))).toBe(s);
    }
  });

  it("出力は iv:ciphertext:authTag の3パート", () => {
    const enc = encryptToken("secret");
    expect(enc.split(":")).toHaveLength(3);
  });

  it("IVはランダムなので同じ平文でも毎回異なる暗号文（両方とも復号可）", () => {
    const a = encryptToken("same");
    const b = encryptToken("same");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same");
    expect(decryptToken(b)).toBe("same");
  });

  it("フォーマット不正（3パートでない）は例外", () => {
    expect(() => decryptToken("not-a-valid-token")).toThrow("Invalid encrypted token format");
    expect(() => decryptToken("a:b")).toThrow("Invalid encrypted token format");
  });

  it("authTag を改竄すると復号に失敗する（GCM認証）", () => {
    const [iv, ct] = encryptToken("secret").split(":");
    const forgedTag = Buffer.from("0".repeat(16)).toString("base64");
    expect(() => decryptToken(`${iv}:${ct}:${forgedTag}`)).toThrow();
  });

  it("別の鍵では復号できない", () => {
    const enc = encryptToken("secret");
    process.env.TOKEN_ENCRYPTION_KEY = "1".repeat(64);
    expect(() => decryptToken(enc)).toThrow();
  });

  it("鍵が未設定・長さ不正なら例外", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow("TOKEN_ENCRYPTION_KEY is not set");
    process.env.TOKEN_ENCRYPTION_KEY = "abc"; // 64文字でない
    expect(() => encryptToken("x")).toThrow("64 hex characters");
  });
});

describe("generateEncryptionKey", () => {
  it("64 hex文字の鍵を毎回異なる値で返す", () => {
    const k1 = generateEncryptionKey();
    const k2 = generateEncryptionKey();
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(k2).toMatch(/^[0-9a-f]{64}$/);
    expect(k1).not.toBe(k2);
  });
});
