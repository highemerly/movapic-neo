/**
 * Misskey MiAuthコールバックエンドポイント
 * GET /api/auth/fediverse/callback/misskey
 */

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { checkMisskeySession } from "@/lib/auth/fediverse";
import { verifyMiAuthSignature } from "@/lib/auth/crypto";
import { encryptToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  try {
    const searchParams = request.nextUrl.searchParams;
    const server = searchParams.get("server");
    const sessionId = searchParams.get("session");
    const timestamp = searchParams.get("ts");
    const signature = searchParams.get("sig");
    const redirectTo = searchParams.get("redirect") || "/dashboard";

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

    // リダイレクト
    return NextResponse.redirect(new URL(redirectTo, baseUrl));
  } catch (error) {
    console.error("MiAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", baseUrl));
  }
}
