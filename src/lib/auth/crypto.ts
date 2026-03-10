/**
 * 暗号化ユーティリティ
 * OAuthセッションデータの暗号化/復号化に使用
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";

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
 * State署名用のシークレットを取得
 */
function getStateSigningSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

/**
 * Stateペイロードの署名を生成（HMAC-SHA256）
 */
function signStatePayload(payload: string): string {
  return createHmac("sha256", getStateSigningSecret())
    .update(payload)
    .digest("hex");
}

/**
 * Stateパラメータを生成（HMAC署名付き）
 */
export function generateOAuthState(callbackUrl: string = "/dashboard"): string {
  const payload: OAuthState = {
    csrf: randomBytes(16).toString("hex"),
    timestamp: Date.now(),
    callbackUrl,
  };
  const payloadStr = JSON.stringify(payload);
  const signature = signStatePayload(payloadStr);

  const signed = { payload: payloadStr, signature };
  return Buffer.from(JSON.stringify(signed)).toString("base64url");
}

/**
 * Stateパラメータを検証して復号（署名検証付き）
 * @param state Base64URLエンコードされたstate
 * @param maxAgeMs 有効期限（デフォルト10分）
 */
export function verifyOAuthState(
  state: string,
  maxAgeMs: number = 10 * 60 * 1000
): OAuthState | null {
  try {
    const { payload, signature } = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    ) as { payload: string; signature: string };

    // 署名検証（タイミング攻撃対策）
    const expectedSignature = signStatePayload(payload);
    const expectedBuf = Buffer.from(expectedSignature);
    const signatureBuf = Buffer.from(signature);

    if (expectedBuf.length !== signatureBuf.length) {
      return null;
    }
    if (!timingSafeEqual(expectedBuf, signatureBuf)) {
      return null;
    }

    const decoded = JSON.parse(payload) as OAuthState;

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
 * MiAuth署名の検証（タイミング攻撃対策済み）
 */
export function verifyMiAuthSignature(
  server: string,
  sessionId: string,
  timestamp: number,
  signature: string
): boolean {
  const expected = generateMiAuthSignature(server, sessionId, timestamp);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * リダイレクトURLを検証し、安全なパスを返す
 * 外部URLや不正なパスの場合はデフォルトにフォールバック
 */
/**
 * リクエスト署名を生成（HMAC-SHA256）
 * Cloudflare Worker等の内部サービスからのリクエスト認証に使用
 */
export function generateRequestSignature(
  timestamp: number,
  bodyHash: string,
  secret: string
): string {
  const data = `${timestamp}:${bodyHash}`;
  return createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * リクエスト署名を検証（タイミング攻撃対策済み）
 * @param timestamp リクエスト時刻（ミリ秒）
 * @param bodyHash リクエストボディのSHA-256ハッシュ
 * @param signature 検証する署名
 * @param secret シークレットキー
 * @param maxAgeMs 許容する時間差（デフォルト5分）
 */
export function verifyRequestSignature(
  timestamp: number,
  bodyHash: string,
  signature: string,
  secret: string,
  maxAgeMs: number = 5 * 60 * 1000
): boolean {
  // タイムスタンプ検証（リプレイ攻撃防止）
  const now = Date.now();
  if (Math.abs(now - timestamp) > maxAgeMs) {
    return false;
  }

  const expected = generateRequestSignature(timestamp, bodyHash, secret);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * ボディのSHA-256ハッシュを計算
 */
export function hashRequestBody(body: Buffer | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function sanitizeRedirectUrl(
  url: string | null | undefined,
  defaultPath: string = "/dashboard"
): string {
  if (!url) {
    return defaultPath;
  }

  // 空白をトリム
  const trimmed = url.trim();

  // 空文字の場合
  if (!trimmed) {
    return defaultPath;
  }

  // プロトコル付きURL（http://, https://, // など）は拒否
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    return defaultPath;
  }

  // スラッシュで始まらない場合は拒否（相対パス攻撃防止）
  if (!trimmed.startsWith("/")) {
    return defaultPath;
  }

  // バックスラッシュを含む場合は拒否（Windows形式のパス）
  if (trimmed.includes("\\")) {
    return defaultPath;
  }

  // 連続スラッシュで始まる場合は拒否（プロトコル相対URL）
  if (trimmed.startsWith("//")) {
    return defaultPath;
  }

  // パストラバーサル攻撃を防止（../ や /../ など）
  if (trimmed.includes("..")) {
    return defaultPath;
  }

  // 制御文字やnull byteを含む場合は拒否
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return defaultPath;
  }

  return trimmed;
}
