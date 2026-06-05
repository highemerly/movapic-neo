/**
 * セッション管理（JWT）
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { randomUUID } from "crypto";
import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";

const LOGIN_SESSION_RETENTION_DAYS = 90;

// Prismaから生成されたInstance型を取得
type Instance = Prisma.InstanceGetPayload<object>;

const SESSION_COOKIE_NAME = "movapic_session";
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7日

// JWT署名用の秘密鍵
function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

// JWTペイロードの型定義（認証に必要な最小限の情報のみ）
// jti は LoginSession.jti と照合して「現在のセッション」を識別するために使う
interface SessionPayload extends JWTPayload {
  userId: string;
  instanceId: string;
  jti: string;
}

// ログイン時に呼び出し元から受け取るリクエスト情報
export type LoginRequestInfo = {
  ipAddress: string;
  userAgent: string | null;
  country: string | null;
  // CloudflareによるIP推定の地域（精度は低くズレる前提）
  region: string | null;
  city: string | null;
};

// getCurrentUserの戻り値の型
export type SessionUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailPrefix: string;
  instanceId: string;
  instance: Instance;
  displayMode: string | null;
};

// getCurrentUserWithValidationの戻り値の型（accessToken含む）
export type SessionUserWithToken = SessionUser & {
  accessToken: string;
};

/**
 * JWTを作成してCookieに設定
 * 同時に LoginSession を1件INSERTし、同ユーザーの90日超の履歴を削除する
 */
export async function createSession(
  userId: string,
  instanceId: string,
  requestInfo: LoginRequestInfo
): Promise<void> {
  const jti = randomUUID();

  const payload: SessionPayload = {
    userId,
    instanceId,
    jti,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getJWTSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });

  // ログイン履歴を記録
  await prisma.loginSession.create({
    data: {
      userId,
      jti,
      ipAddress: requestInfo.ipAddress,
      userAgent: requestInfo.userAgent,
      country: requestInfo.country,
      region: requestInfo.region,
      city: requestInfo.city,
    },
  });

  // 保持期間を超えた履歴を削除（同ユーザー分のみなので軽量）
  const cutoff = new Date(
    Date.now() - LOGIN_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  await prisma.loginSession.deleteMany({
    where: {
      userId,
      createdAt: { lt: cutoff },
    },
  });
}


/**
 * セッションCookieを削除
 */
export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * 現在のセッションからペイロードを取得
 */
async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJWTSecret());
    return payload as SessionPayload;
  } catch {
    // トークンが無効または期限切れ
    return null;
  }
}

/**
 * 現在のユーザーを取得（セッションがない場合はnull）
 * JWTからユーザーIDを取得し、DBからユーザー情報を取得して返す
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const payload = await getSessionPayload();

  if (!payload) {
    return null;
  }

  // ユーザー存在 + セッション未失効 を1クエリで検証（EXISTSサブクエリ）。
  // jti は @unique インデックスのため追加クエリ・追加負荷なし。
  // fail-closed: 対応する LoginSession が無い/失効済みなら未認証扱い。
  const user = await prisma.user.findFirst({
    where: {
      id: payload.userId,
      loginSessions: { some: { jti: payload.jti, revokedAt: null } },
    },
    include: { instance: true },
  });

  if (!user) {
    // ユーザーが削除された / セッションが失効した場合はセッション無効
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailPrefix: user.emailPrefix,
    instanceId: user.instanceId,
    instance: user.instance,
    displayMode: user.displayMode,
  };
}

/**
 * 現在のユーザーを取得（DB検証付き）
 * ユーザーが削除されていないかDBで確認する
 */
export async function getCurrentUserWithValidation(): Promise<SessionUserWithToken | null> {
  const payload = await getSessionPayload();

  if (!payload) {
    return null;
  }

  // ユーザー存在 + セッション未失効 を1クエリで検証（getCurrentUserと同様）
  const user = await prisma.user.findFirst({
    where: {
      id: payload.userId,
      loginSessions: { some: { jti: payload.jti, revokedAt: null } },
    },
    include: { instance: true },
  });

  if (!user) {
    // ユーザーが削除された / セッションが失効した場合
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailPrefix: user.emailPrefix,
    instanceId: user.instanceId,
    instance: user.instance,
    displayMode: user.displayMode,
    accessToken: user.accessToken,
  };
}

/**
 * ユーザーIDのみを取得（軽量版）
 * DB問い合わせなしでJWTからユーザーIDを取得
 */
export async function getCurrentUserId(): Promise<string | null> {
  const payload = await getSessionPayload();
  return payload?.userId ?? null;
}

/**
 * 現在のセッションのjtiを取得（DB問い合わせなし）
 * /dashboard/sessions で「これは現在のセッション」を示すために使う
 */
export async function getCurrentSessionJti(): Promise<string | null> {
  const payload = await getSessionPayload();
  return payload?.jti ?? null;
}

/**
 * 指定したセッションを失効させる（本人のもののみ）
 * userId で絞ることで他人のセッションを失効できないようにする（IDOR対策）。
 * @returns 失効に成功したら true、対象が見つからない/他人のものなら false
 */
export async function revokeSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const result = await prisma.loginSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}
