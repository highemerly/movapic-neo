/**
 * 暗号化ユーティリティ
 * OAuthセッションデータの暗号化/復号化に使用
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * JWT_SECRETから暗号化キーを導出
 */
function getOAuthEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  // SHA-256でキーを導出（32バイト）
  return createHash("sha256").update(secret).digest();
}

/**
 * OAuthセッションデータの型定義
 */
export interface OAuthSessionData {
  server: string;
  clientId: string;
  clientSecret: string;
  platform: "mastodon" | "misskey";
  createdAt: number;
}

/**
 * オブジェクトを暗号化してBase64URL文字列を返す
 */
export function encryptOAuthSession(data: OAuthSessionData): string {
  const key = getOAuthEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // iv + encrypted + authTag を結合してBase64URLエンコード
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64url");
}

/**
 * 暗号化されたBase64URL文字列を復号化してオブジェクトを返す
 */
export function decryptOAuthSession(encrypted: string): OAuthSessionData | null {
  try {
    const key = getOAuthEncryptionKey();
    const combined = Buffer.from(encrypted, "base64url");

    // iv, encrypted, authTag を分離
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Stateパラメータの型定義
 */
export interface OAuthState {
  csrf: string;
  timestamp: number;
  callbackUrl: string;
}

/**
 * Stateパラメータを生成（Base64URLエンコード）
 */
export function generateOAuthState(callbackUrl: string = "/dashboard"): string {
  const state: OAuthState = {
    csrf: randomBytes(16).toString("hex"),
    timestamp: Date.now(),
    callbackUrl,
  };
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

/**
 * Stateパラメータを検証して復号
 * @param state Base64URLエンコードされたstate
 * @param maxAgeMs 有効期限（デフォルト10分）
 */
export function verifyOAuthState(
  state: string,
  maxAgeMs: number = 10 * 60 * 1000
): OAuthState | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    ) as OAuthState;

    // タイムスタンプ検証
    if (Date.now() - decoded.timestamp > maxAgeMs) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * MiAuth用のセッションID生成
 */
export function generateMiAuthSessionId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * MiAuth用の署名生成（HMAC-SHA256）
 */
export function generateMiAuthSignature(
  server: string,
  sessionId: string,
  timestamp: number
): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  const data = `${server}:${sessionId}:${timestamp}`;
  return createHash("sha256")
    .update(secret + data)
    .digest("hex");
}

/**
 * MiAuth署名の検証
 */
export function verifyMiAuthSignature(
  server: string,
  sessionId: string,
  timestamp: number,
  signature: string
): boolean {
  const expected = generateMiAuthSignature(server, sessionId, timestamp);
  return expected === signature;
}
