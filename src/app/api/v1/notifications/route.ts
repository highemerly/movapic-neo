/**
 * 通知一覧API（ログインユーザーのみ）
 * GET /api/v1/notifications?limit=5
 *
 * Notification テーブルを直近90日で読み、種別(type)・実績キー・関連画像（サムネ+リンク）を返す。
 * 実績通知の表示文言はクライアントが achievementKey から CATALOG を引いて解決する。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getRecentNotifications } from "@/lib/achievements/notifications";
import { parsePageLimit } from "@/lib/pagination";

/** 1リクエストで返す通知の上限（ベルは5件・通知ページは limit 未指定で全件）。 */
const MAX_NOTIFICATION_LIMIT = 50;

export async function GET(request: NextRequest) {
  // fail-closed な getCurrentUser（loginSessions.revokedAt を EXISTS 検証）で認証する。
  // JWT ペイロードのみの軽量取得だと失効済みセッションでも通知を読めてしまうため使わない。
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = user.id;

  // limit 未指定は「全件」（通知ページ用）。指定があれば共通の parsePageLimit で 1〜50 に正規化する。
  // pitfall: 以前は `parseInt(..) || 0` で ?limit=abc / ?limit=0 が 0 になり、lib 側の
  // falsy 判定で take が外れて直近90日分を全件返していた（上限が無言で外れる）。
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit =
    limitRaw === null
      ? undefined
      : parsePageLimit(limitRaw, { maxLimit: MAX_NOTIFICATION_LIMIT });

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
