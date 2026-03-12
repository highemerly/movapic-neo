/**
 * Fediverse認証開始エンドポイント
 * POST /api/auth/fediverse/register
 *
 * Mastodon/Misskeyインスタンスを動的に検出し、
 * アプリケーション登録（Mastodon）またはMiAuthセッション（Misskey）を開始
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  detectInstanceType,
  normalizeServer,
  registerMastodonApp,
  getMastodonAuthorizationUrl,
  getMisskeyAuthorizationUrl,
} from "@/lib/auth/fediverse";
import {
  encryptOAuthSession,
  generateOAuthState,
  generateMiAuthSessionId,
  generateMiAuthSignature,
  type OAuthSessionData,
} from "@/lib/auth/crypto";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";

const OAUTH_SESSION_COOKIE = "oauth_session";
const OAUTH_STATE_COOKIE = "oauth_state";
const COOKIE_MAX_AGE = 10 * 60; // 10分

// 許可されたサーバーリスト（カンマ区切り、空の場合は全て許可）
function getAllowedServers(): string[] | null {
  const allowed = process.env.ALLOWED_SERVERS;
  if (!allowed || allowed.trim() === "") {
    return null; // 制限なし
  }
  return allowed.split(",").map((s) => s.trim().toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { server, callbackUrl } = body;

    if (!server || typeof server !== "string") {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "サーバー名を入力してください",
        400
      );
    }

    // サーバー名を正規化
    const normalizedServer = normalizeServer(server);

    // 許可サーバーチェック
    const allowedServers = getAllowedServers();
    if (allowedServers && !allowedServers.includes(normalizedServer)) {
      return errorResponse(
        ErrorCodes.SERVER_NOT_ALLOWED,
        "このサーバーは現在サポートされていません",
        403
      );
    }

    // インスタンスの種類を検出
    const instanceInfo = await detectInstanceType(normalizedServer);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not set");
    }

    const cookieStore = await cookies();

    if (instanceInfo.type === "mastodon") {
      // Mastodon: 動的クライアント登録
      const redirectUri = `${baseUrl}/api/auth/fediverse/callback/mastodon`;
      const appCredentials = await registerMastodonApp(normalizedServer, redirectUri);

      // OAuthセッションデータを暗号化してクッキーに保存
      const sessionData: OAuthSessionData = {
        server: normalizedServer,
        clientId: appCredentials.clientId,
        clientSecret: appCredentials.clientSecret,
        platform: "mastodon",
        createdAt: Date.now(),
      };
      const encryptedSession = encryptOAuthSession(sessionData);

      // Stateパラメータを生成
      const state = generateOAuthState(callbackUrl || "/dashboard");

      // クッキーに保存
      cookieStore.set(OAUTH_SESSION_COOKIE, encryptedSession, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });

      cookieStore.set(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });

      // 認可URLを生成
      const authorizationUrl = getMastodonAuthorizationUrl(
        normalizedServer,
        appCredentials.clientId,
        redirectUri,
        state
      );

      return NextResponse.json({
        success: true,
        url: authorizationUrl,
        platform: "mastodon",
        server: normalizedServer,
      });
    } else if (instanceInfo.type === "misskey") {
      // Misskey: MiAuth
      const sessionId = generateMiAuthSessionId();
      const timestamp = Date.now();
      const signature = generateMiAuthSignature(normalizedServer, sessionId, timestamp);

      // コールバックURLを構築
      const callbackParams = new URLSearchParams({
        server: normalizedServer,
        session: sessionId,
        ts: timestamp.toString(),
        sig: signature,
        redirect: callbackUrl || "/dashboard",
      });
      const miAuthCallback = `${baseUrl}/api/auth/fediverse/callback/misskey?${callbackParams.toString()}`;

      // MiAuth認可URLを生成
      const authorizationUrl = getMisskeyAuthorizationUrl(
        normalizedServer,
        sessionId,
        miAuthCallback
      );

      return NextResponse.json({
        success: true,
        url: authorizationUrl,
        platform: "misskey",
        server: normalizedServer,
      });
    }

    return errorResponse(
      ErrorCodes.VALIDATION_INVALID,
      "サポートされていないインスタンスです",
      400,
      { suggestion: "MastodonまたはMisskeyのサーバーを指定してください" }
    );
  } catch (error) {
    return handleUnknownError(error);
  }
}
