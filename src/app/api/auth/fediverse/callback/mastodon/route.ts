/**
 * Mastodon OAuthコールバックエンドポイント
 * GET /api/auth/fediverse/callback/mastodon
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import {
  exchangeMastodonCode,
  getMastodonAccount,
} from "@/lib/auth/fediverse";
import {
  decryptOAuthSession,
  verifyOAuthState,
  sanitizeRedirectUrl,
} from "@/lib/auth/crypto";
import { encryptToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import prisma from "@/lib/db";

const OAUTH_SESSION_COOKIE = "oauth_session";
const OAUTH_STATE_COOKIE = "oauth_state";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // エラーチェック
    if (error) {
      console.error("OAuth error:", error);
      return NextResponse.redirect(new URL("/?error=oauth_denied", baseUrl));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL("/?error=invalid_request", baseUrl));
    }

    const cookieStore = await cookies();

    // State検証
    const savedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL("/?error=invalid_state", baseUrl));
    }

    const stateData = verifyOAuthState(state);
    if (!stateData) {
      return NextResponse.redirect(new URL("/?error=expired_state", baseUrl));
    }

    // OAuthセッションを復号
    const encryptedSession = cookieStore.get(OAUTH_SESSION_COOKIE)?.value;
    if (!encryptedSession) {
      return NextResponse.redirect(new URL("/?error=session_expired", baseUrl));
    }

    const sessionData = decryptOAuthSession(encryptedSession);
    if (!sessionData || sessionData.platform !== "mastodon") {
      return NextResponse.redirect(new URL("/?error=invalid_session", baseUrl));
    }

    // セッションの有効期限確認（10分）
    if (Date.now() - sessionData.createdAt > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL("/?error=session_expired", baseUrl));
    }

    // クッキーを削除
    cookieStore.delete(OAUTH_SESSION_COOKIE);
    cookieStore.delete(OAUTH_STATE_COOKIE);

    const { server, clientId, clientSecret } = sessionData;
    const redirectUri = `${baseUrl}/api/auth/fediverse/callback/mastodon`;

    // トークン取得
    const tokenResponse = await exchangeMastodonCode(
      server,
      clientId,
      clientSecret,
      code,
      redirectUri
    );

    // ユーザー情報取得
    const account = await getMastodonAccount(server, tokenResponse.accessToken);

    // インスタンスを取得または作成
    let instance = await prisma.instance.findUnique({
      where: { domain: server },
    });

    if (!instance) {
      instance = await prisma.instance.create({
        data: {
          domain: server,
          type: "mastodon",
          // 動的登録のため、client_id/secretはDBに保存しない
        },
      });
    }

    // ユーザーを取得または作成
    const encryptedToken = encryptToken(tokenResponse.accessToken);

    let user = await prisma.user.findUnique({
      where: {
        instanceId_remoteId: {
          instanceId: instance.id,
          remoteId: account.id,
        },
      },
    });

    if (user) {
      // 既存ユーザーを更新
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          accessToken: encryptedToken,
          lastLoginAt: new Date(),
        },
      });
    } else {
      // 新規ユーザーを作成
      user = await prisma.user.create({
        data: {
          instanceId: instance.id,
          remoteId: account.id,
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          emailPrefix: nanoid(16),
          accessToken: encryptedToken,
          lastLoginAt: new Date(),
        },
      });
    }

    // JWTセッション作成
    await createSession(
      {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        emailPrefix: user.emailPrefix,
        instanceId: user.instanceId,
      },
      instance
    );

    // コールバックURLにリダイレクト（安全なパスのみ許可）
    const redirectTo = sanitizeRedirectUrl(stateData.callbackUrl);
    return NextResponse.redirect(new URL(redirectTo, baseUrl));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
