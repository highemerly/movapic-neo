/**
 * セッション失効エンドポイント
 * DELETE /api/v1/sessions/:id
 *
 * ログイン履歴（LoginSession）を失効させる。本人のセッションのみ対象。
 * 失効後は該当JWTでの認証が拒否される（getCurrentUserが未認証扱いにする）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, revokeSession } from "@/lib/auth/session";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id } = await params;

    // 本人のセッションのみ失効可能（userIdで絞ることでIDOR/他人のセッション失効を防ぐ）
    const revoked = await revokeSession(user.id, id);

    if (!revoked) {
      return NextResponse.json(
        { error: "対象のセッションが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to revoke session:", error);
    return NextResponse.json(
      { error: "セッションの失効に失敗しました" },
      { status: 500 }
    );
  }
}
