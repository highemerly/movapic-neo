/**
 * セッション管理（JWT）
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";

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
interface SessionPayload extends JWTPayload {
  userId: string;
  instanceId: string;
}

// getCurrentUserの戻り値の型
export type SessionUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailPrefix: string;
  instanceId: string;
  instance: Instance;
};

// getCurrentUserWithValidationの戻り値の型（accessToken含む）
export type SessionUserWithToken = SessionUser & {
  accessToken: string;
};

/**
 * JWTを作成してCookieに設定
 */
export async function createSession(
  userId: string,
  instanceId: string
): Promise<void> {
  const payload: SessionPayload = {
    userId,
    instanceId,
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
}

/**
 * セッションCookieを設定（後方互換性のため残す - createSessionに統合済み）
 * @deprecated createSessionを使用してください
 */
export async function setSessionCookie(_sessionToken: string): Promise<void> {
  // JWTではcreateSession内でCookieを設定するため、この関数は不要
  // 呼び出し元の移行が完了したら削除予定
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

  // ユーザーとインスタンスをDBから取得
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { instance: true },
  });

  if (!user) {
    // ユーザーが削除されている場合はセッション無効
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

  // ユーザーとインスタンスをDBから取得して存在確認
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { instance: true },
  });

  if (!user) {
    // ユーザーが削除されている場合
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
