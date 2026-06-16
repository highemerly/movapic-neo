/**
 * 通知一覧API（ログインユーザーのみ）
 * GET /api/v1/notifications?limit=5
 *
 * Notification テーブルを直近90日で読み、種別(type)・実績キー・関連画像（サムネ+リンク）を返す。
 * 実績通知の表示文言はクライアントが achievementKey から CATALOG を引いて解決する。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { getRecentNotifications } from "@/lib/achievements/notifications";

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 0, 0), 50) : undefined;

  const items = await getRecentNotifications(userId, limit);

  return NextResponse.json({
    notifications: items.map((n) => ({
      id: n.id,
      type: n.type,
      achievementKey: n.achievementKey,
      createdAt: n.createdAt.toISOString(),
      image: n.image,
      favorite: n.favorite,
      recipientUsername: n.recipientUsername,
    })),
  });
}
