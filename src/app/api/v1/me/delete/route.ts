/**
 * アカウント削除エンドポイント
 * POST /api/v1/me/delete
 *
 * 「即ログアウト＋裏で削除」方式:
 *  - DB のユーザー削除は同期的に行う（カスケードで Image/Notification/Achievement/
 *    LoginSession/Report も即消える＝全一覧・プロフィールから即時消滅、全セッション無効化）。
 *  - 遅い R2 オブジェクト削除だけをバックグラウンドジョブに逃がす。
 *  - 操作ミス防止のため、確認入力（アカウント名 = username）の完全一致を必須にする（type to delete）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, deleteSessionCookie } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { enqueueDeleteAccount } from "@/lib/queue";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const confirmName =
      typeof body?.confirmName === "string" ? body.confirmName.trim() : "";

    // type to delete: アカウント名@サーバー名と完全一致しなければ拒否
    const requiredName = `${user.username}@${user.instance.domain}`;
    if (confirmName !== requiredName) {
      return NextResponse.json(
        { error: "アカウント名が一致しません" },
        { status: 400 }
      );
    }

    // ユーザー削除後はカスケードで Image も消えてキーを取得できなくなるため、
    // 先に R2 から削除すべき全オブジェクトキー（出力画像＋サムネイル）を集める。
    const images = await prisma.image.findMany({
      where: { userId: user.id },
      select: { storageKey: true, thumbnailKey: true },
    });
    const storageKeys = images.flatMap((img) =>
      img.thumbnailKey ? [img.storageKey, img.thumbnailKey] : [img.storageKey]
    );

    // DB ユーザーを削除（Image/Notification/Achievement/LoginSession/Report はカスケード）。
    // これで即座に全一覧・プロフィールから消え、全セッションも無効になる。
    await prisma.user.delete({ where: { id: user.id } });

    // 現在のセッション Cookie も破棄（即ログアウト）
    await deleteSessionCookie();

    // 遅い R2 削除はバックグラウンドへ。enqueue が失敗しても
    // アカウント削除自体は成立済み（孤立オブジェクトが残るだけ）なので致命的ではない。
    try {
      await enqueueDeleteAccount({ userId: user.id, storageKeys });
    } catch (e) {
      console.error(
        "[delete-account] R2削除ジョブの enqueue に失敗（孤立オブジェクトが残る可能性）:",
        e
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return NextResponse.json(
      { error: "アカウントの削除に失敗しました" },
      { status: 500 }
    );
  }
}
