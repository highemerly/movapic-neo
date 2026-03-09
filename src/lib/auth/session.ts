/**
 * セッション管理（JWT）
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/db";
import type { Instance } from "@prisma/client";

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

// JWTペイロードの型定義
interface SessionPayload extends JWTPayload {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailPrefix: string;
  instanceId: string;
  instanceDomain: string;
  instanceType: string;
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

/**
 * JWTを作成してCookieに設定
 */
export async function createSession(
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    emailPrefix: string;
    instanceId: string;
  },
  instance: Instance
): Promise<void> {
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailPrefix: user.emailPrefix,
    instanceId: user.instanceId,
    instanceDomain: instance.domain,
    instanceType: instance.type,
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
 * JWTからユーザー情報を復元し、インスタンス情報を含めて返す
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const payload = await getSessionPayload();

  if (!payload) {
    return null;
  }

  // インスタンス情報はDBから取得（型の整合性のため）
  const instance = await prisma.instance.findUnique({
    where: { id: payload.instanceId },
  });

  if (!instance) {
    // インスタンスが削除されている場合はセッション無効
    return null;
  }

  return {
    id: payload.userId,
    username: payload.username,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl,
    emailPrefix: payload.emailPrefix,
    instanceId: payload.instanceId,
    instance,
  };
}

/**
 * 現在のユーザーを取得（DB検証付き）
 * ユーザーが削除されていないかDBで確認する
 */
export async function getCurrentUserWithValidation(): Promise<SessionUser | null> {
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
