/**
 * Mastodon投稿削除エンドポイント
 * POST /api/v1/fediverse/delete-status
 *
 * 画像削除後に「Mastodonに残っている投稿も削除する」をユーザーが選んだときに呼ぶ。
 * ユーザー自身のアクセストークンで、ユーザーのインスタンスの投稿を削除する。
 * （画像のDBレコードは既に削除済みのため、statusId はクライアントから受け取る。
 *  自分のトークンでは自分の投稿しか削除できないため、これは安全。）
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { decryptToken } from "@/lib/auth/tokens";
import { deleteMastodonStatus } from "@/lib/fediverse/delete";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserWithValidation();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    if (user.instance.type !== "mastodon") {
      return NextResponse.json(
        { error: "Mastodonアカウントではありません" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const statusId = body?.statusId;
    if (!statusId || typeof statusId !== "string") {
      return NextResponse.json(
        { error: "statusIdが指定されていません" },
        { status: 400 }
      );
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(user.accessToken);
    } catch (error) {
      console.error("Failed to decrypt token:", error);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const ok = await deleteMastodonStatus(
      user.instance.domain,
      accessToken,
      statusId
    );

    if (!ok) {
      return NextResponse.json(
        { error: "Mastodon投稿の削除に失敗しました" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete Mastodon status:", error);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
