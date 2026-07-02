/**
 * セッション一括失効エンドポイント
 * DELETE /api/v1/sessions
 *
 * 現在のこの端末（currentJti）を除く、本人の全セッションを失効させる。
 * 失効後は該当JWTでの認証が拒否される（getCurrentUserが未認証扱いにする）。
 */

import { NextResponse } from "next/server";
import {
  getCurrentUser,
  getCurrentSessionJti,
  revokeOtherSessions,
} from "@/lib/auth/session";

export async function DELETE() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 現在のセッションだけは残す（この端末はログイン状態を維持）
    const currentJti = await getCurrentSessionJti();
    if (!currentJti) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const count = await revokeOtherSessions(user.id, currentJti);

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Failed to revoke all sessions:", error);
    return NextResponse.json(
      { error: "セッションの失効に失敗しました" },
      { status: 500 }
    );
  }
}
