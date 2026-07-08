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

// JWTペイロードの型定義
// jti は LoginSession.jti と照合して「現在のセッション」を識別するために使う。
// username/displayName/avatarUrl/instance* は「ログイン時にしか変わらない or 不変」な
// 識別・表示用フィールド（コールバックが毎ログインで同期）。DBと鮮度差がないため埋め込み、
// ヘッダー等の表示をDBアクセスなしで行えるようにする。
// ※ Fediverse認証トークンなど「アプリ内で変わる機密/可変値」は絶対に入れない。
interface SessionPayload extends JWTPayload {
  userId: string;
  instanceId: string;
  jti: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  instanceDomain: string;
  instanceType: string;
}

// createSession に渡す識別フィールド（ログイン時に手元の user/instance から渡す）
export type SessionIdentity = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  instanceDomain: string;
  instanceType: string;
};

// getSessionClaims の戻り値（DBアクセスなしで得られる識別/表示情報）
export type SessionClaims = {
  userId: string;
  instanceId: string;
  jti: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  instanceDomain: string;
  instanceType: string;
};

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
};

// getCurrentUserWithValidationの戻り値の型（accessToken含む）
export type SessionUserWithToken = SessionUser & {
  accessToken: string;
  /** カレンダーの自動穴埋め設定（投稿時の穴埋め自動割当の要否）。 */
  autoMakeup: boolean;
};

/**
 * JWTを作成してCookieに設定
 * 同時に LoginSession を1件INSERTし、同ユーザーの90日超の履歴を削除する
 */
export async function createSession(
  userId: string,
  instanceId: string,
  identity: SessionIdentity,
  requestInfo: LoginRequestInfo
): Promise<void> {
  const jti = randomUUID();

  const payload: SessionPayload = {
    userId,
    instanceId,
    jti,
    username: identity.username,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    instanceDomain: identity.instanceDomain,
    instanceType: identity.instanceType,
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
 * セッションの識別/表示情報を取得（DBアクセスなし）
 * 署名と有効期限のみ検証し、失効チェックは行わない。
 * 「ログイン中か」の判定や、ヘッダー等の表示（username/avatar等）に使う。
 * ※ 失効を即時に反映する必要がある機密操作には getCurrentUser を使うこと。
 *
 * 後方互換: 新フィールド導入前に発行された既存JWTには表示用フィールドが無いため、
 * username 等は undefined になりうる（Cookieは7日で自然失効＝自己修復）。
 * 表示用途の呼び出し側は値の欠落を許容すること。ログイン判定（戻り値の有無）は旧JWTでも有効。
 */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const payload = await getSessionPayload();
  if (!payload) {
    return null;
  }
  return {
    userId: payload.userId,
    instanceId: payload.instanceId,
    jti: payload.jti,
    username: payload.username,
    displayName: payload.displayName,
    avatarUrl: payload.avatarUrl,
    instanceDomain: payload.instanceDomain,
    instanceType: payload.instanceType,
  };
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
    accessToken: user.accessToken,
    autoMakeup: user.autoMakeup,
  };
}

// getCurrentUserWithPreferences の戻り値の型（投稿ページのフォーム初期値用）
// preferences の各値は DB のスカラー（string | null）のまま返し、
// UI の union 型へのキャストは呼び出し側で行う（session.ts に @/types を持ち込まない）。
export type SessionUserWithPreferences = SessionUser & {
  instanceDomain: string;
  instanceType: string;
  preferences: {
    position: string | null;
    font: string | null;
    color: string | null;
    size: string | null;
    arrangement: string | null;
    visibility: string | null;
    cameraOption: string | null;
  };
};

/**
 * 現在のユーザーを preferences 付きで取得（失効チェック付き・1クエリ）
 * 投稿ページ（/create）のサーバーシェルでフォーム初期値をseedするために使う。
 * getCurrentUser と同じEXISTSサブクエリ検証なので、同一 user 行から
 * defaultX スカラーを追加で読むだけ＝追加の往復なし。
 */
export async function getCurrentUserWithPreferences(): Promise<SessionUserWithPreferences | null> {
  const payload = await getSessionPayload();

  if (!payload) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: payload.userId,
      loginSessions: { some: { jti: payload.jti, revokedAt: null } },
    },
    include: { instance: true },
  });

  if (!user) {
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
    instanceDomain: user.instance.domain,
    instanceType: user.instance.type,
    preferences: {
      position: user.defaultPosition,
      font: user.defaultFont,
      color: user.defaultColor,
      size: user.defaultSize,
      arrangement: user.defaultArrangement,
      visibility: user.defaultVisibility,
      cameraOption: user.defaultCameraOption,
    },
  };
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

/**
 * 現在のセッション以外の全セッションを失効させる（本人のもののみ）
 * currentJti を除外することで「この端末」だけログイン状態を維持する。
 * userId で絞るため他人のセッションには影響しない（IDOR対策）。
 * @returns 失効させた件数
 */
export async function revokeOtherSessions(
  userId: string,
  currentJti: string
): Promise<number> {
  const result = await prisma.loginSession.updateMany({
    where: { userId, revokedAt: null, jti: { not: currentJti } },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
