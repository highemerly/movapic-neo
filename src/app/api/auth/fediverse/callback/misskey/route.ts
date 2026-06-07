/**
 * Misskey MiAuthコールバックエンドポイント
 * GET /api/auth/fediverse/callback/misskey
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { checkMisskeySession } from "@/lib/auth/fediverse";
import { verifyMiAuthSignature, sanitizeRedirectUrl } from "@/lib/auth/crypto";
import { encryptToken } from "@/lib/auth/tokens";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { extractLoginRequestInfo } from "@/lib/auth/requestInfo";
import prisma from "@/lib/db";

const MIAUTH_STATE_COOKIE = "miauth_state";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  try {
    const searchParams = request.nextUrl.searchParams;
    const server = searchParams.get("server");
    const sessionId = searchParams.get("session");
    const timestamp = searchParams.get("ts");
    const signature = searchParams.get("sig");
    const redirectTo = sanitizeRedirectUrl(searchParams.get("redirect"));

    // パラメータ検証
    if (!server || !sessionId || !timestamp || !signature) {
      return NextResponse.redirect(new URL("/?error=invalid_request", baseUrl));
    }

    // 署名検証
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
      return NextResponse.redirect(new URL("/?error=invalid_request", baseUrl));
    }

    // タイムスタンプ検証（10分以内）
    if (Date.now() - ts > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL("/?error=expired_state", baseUrl));
    }

    if (!verifyMiAuthSignature(server, sessionId, ts, signature)) {
      return NextResponse.redirect(new URL("/?error=invalid_signature", baseUrl));
    }

    // ログインCSRF対策: register時にセットしたクッキーとURLのsessionIdを照合し、
    // フローを開始した本人のブラウザであることを確認する
    const cookieStore = await cookies();
    const savedSessionId = cookieStore.get(MIAUTH_STATE_COOKIE)?.value;
    if (!savedSessionId || savedSessionId !== sessionId) {
      // 重複コールバック対策: 1回目の成功でstateクッキーは削除されるため、
      // 同じコールバックが二重に来ると2回目はここで弾かれてしまう。
      // 既にログイン済みなら直前の成功の重複とみなし、成功先へ送る。
      // （このフォールバックではセッションを新規作成しないためログインCSRFは防げる）
      const existingUser = await getCurrentUser();
      if (existingUser) {
        console.warn("[miauth] duplicate misskey callback detected; treating as success");
        return NextResponse.redirect(new URL(redirectTo, baseUrl));
      }
      return NextResponse.redirect(new URL("/?error=invalid_state", baseUrl));
    }
    cookieStore.delete(MIAUTH_STATE_COOKIE);

    // MiAuthセッションを確認してトークン取得
    const { token, user: misskeyUser } = await checkMisskeySession(server, sessionId);

    // インスタンスを取得または作成
    let instance = await prisma.instance.findUnique({
      where: { domain: server },
    });

    if (!instance) {
      instance = await prisma.instance.create({
        data: {
          domain: server,
          type: "misskey",
        },
      });
    }

    // ユーザーを取得または作成
    const encryptedToken = encryptToken(token);

    let user = await prisma.user.findUnique({
      where: {
        instanceId_remoteId: {
          instanceId: instance.id,
          remoteId: misskeyUser.id,
        },
      },
    });

    if (user) {
      // 既存ユーザーを更新
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: misskeyUser.username,
          displayName: misskeyUser.displayName,
          avatarUrl: misskeyUser.avatarUrl,
          accessToken: encryptedToken,
          lastLoginAt: new Date(),
        },
      });
    } else {
      // 新規ユーザーを作成
      user = await prisma.user.create({
        data: {
          instanceId: instance.id,
          remoteId: misskeyUser.id,
          username: misskeyUser.username,
          displayName: misskeyUser.displayName,
          avatarUrl: misskeyUser.avatarUrl,
          emailPrefix: nanoid(24),
          accessToken: encryptedToken,
          lastLoginAt: new Date(),
        },
      });
    }

    // JWTセッション作成（ログイン履歴に記録）
    await createSession(user.id, instance.id, extractLoginRequestInfo(request));

    // リダイレクト
    return NextResponse.redirect(new URL(redirectTo, baseUrl));
  } catch (error) {
    console.error("MiAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
