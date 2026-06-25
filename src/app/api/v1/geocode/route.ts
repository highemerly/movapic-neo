/**
 * GPS座標 → 都道府県・市区町村への逆ジオコーディングエンドポイント
 * POST /api/v1/geocode
 *
 * /create でユーザーが「位置情報を含める」を選んだ時に呼ばれる。
 * プレビューのたびに呼ぶのは無駄なので、クライアントは結果をキャッシュして再利用する想定。
 *
 * 投稿時には /api/v1/post 側でも再度逆ジオコーディングしてDB保存する（権威データを
 * サーバー側で確定させるため）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { reverseGeocode } from "@/lib/geocode/gsi";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: { lat?: unknown; lng?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const lat = typeof body.lat === "number" ? body.lat : NaN;
  const lng = typeof body.lng === "number" ? body.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lngが不正です" }, { status: 400 });
  }

  const result = await reverseGeocode(lat, lng);
  if (!result) {
    // GSI は日本国内専用のため、海外・海上などは特定できず {} を返す（→ null）。
    return NextResponse.json(
      { error: "撮影場所を特定できませんでした（海外・海上などは未対応です）" },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
