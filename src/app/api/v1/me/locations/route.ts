/**
 * 自分が過去に投稿したことのある位置情報の一覧
 * GET /api/v1/me/locations
 *
 * GPS座標を持たない画像でも、過去に投稿実績のある都道府県／都道府県+市町村なら
 * /create で手動選択して位置を付与できる。その選択肢を返す。
 * （/api/v1/geocode と同様に、createページから必要なときだけ遅延fetchする想定）
 *
 * 実際に保存するかは POST /api/v1/post 側で同条件を再検証して確定する。
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserPostedLocations } from "@/lib/locations";
import { ErrorCodes, errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401);
    }

    const locations = await getUserPostedLocations(user.id);
    return NextResponse.json(locations);
  } catch (error) {
    console.error("Failed to load past locations:", error);
    return errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      "過去の投稿地の取得に失敗しました",
      500,
    );
  }
}
