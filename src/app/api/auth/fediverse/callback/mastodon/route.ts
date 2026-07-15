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
import { resolveLoginRedirect } from "@/lib/auth/loginRedirect";
import { encryptToken } from "@/lib/auth/tokens";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { extractLoginRequestInfo } from "@/lib/auth/requestInfo";
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
      // 重複コールバック対策: 1回目の成功でstate/sessionクッキーは削除されるため、
      // 同じコールバックが二重に来ると2回目はここで弾かれてしまう。
      // 既にログイン済みなら直前の成功の重複とみなし、成功先へ送る。
      // （このフォールバックではセッションを新規作成しないためログインCSRFは防げる）
      const existingUser = await getCurrentUser();
      if (existingUser) {
        console.warn("[oauth] duplicate mastodon callback detected; treating as success");
        const stateData = verifyOAuthState(state);
        const sanitized = stateData
          ? sanitizeRedirectUrl(stateData.callbackUrl)
          : "/dashboard";
        const dupRedirect = resolveLoginRedirect(sanitized, {
          isNewUser: false,
          username: existingUser.username,
          instanceDomain: existingUser.instance.domain,
        });
        return NextResponse.redirect(new URL(dupRedirect, baseUrl));
      }
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

    // 初回ログイン（新規ユーザー作成）かどうか。初回はダッシュボードではなく
    // 投稿ページへ誘導して、最初の一枚までの導線を短くする。
    const isNewUser = !user;

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
      // 新規ユーザーを作成（ログイン前に規約同意トグルを通過している＝同意日時を記録）
      user = await prisma.user.create({
        data: {
          instanceId: instance.id,
          remoteId: account.id,
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          emailPrefix: nanoid(24),
          accessToken: encryptedToken,
          lastLoginAt: new Date(),
          termsAgreedAt: new Date(),
        },
      });
    }

    // JWTセッション作成（ログイン履歴に記録）
    await createSession(
      user.id,
      instance.id,
      {
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        instanceDomain: instance.domain,
        instanceType: instance.type,
      },
      extractLoginRequestInfo(request)
    );

    // コールバックURLにリダイレクト（安全なパスのみ許可）。遷移先が既定（/dashboard センチネル
    // ＝特定ページへ戻る指定ではない）のときは、初回ログインなら /create?welcome=1、既存ユーザーなら
    // 自分のユーザーページへ。明示的な returnTo はそのまま尊重する。
    const sanitized = sanitizeRedirectUrl(stateData.callbackUrl);
    const redirectTo = resolveLoginRedirect(sanitized, {
      isNewUser,
      username: user.username,
      instanceDomain: instance.domain,
    });
    return NextResponse.redirect(new URL(redirectTo, baseUrl));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
