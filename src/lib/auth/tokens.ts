/**
 * トークン暗号化/復号化
 * AES-256-GCM を使用
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  // 32バイトのhex文字列を期待
  if (key.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

/**
 * トークンを暗号化
 * 返り値: base64エンコードされた "iv:ciphertext:authTag"
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // iv:ciphertext:authTag の形式でbase64エンコード
  return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`;
}

/**
 * 暗号化されたトークンを復号化
 */
export function decryptToken(encryptedToken: string): string {
  const key = getEncryptionKey();
  const parts = encryptedToken.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivBase64, ciphertext, authTagBase64] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * 暗号化キーを生成（セットアップ用）
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
