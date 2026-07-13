/**
 * 上部バナー用の「いま掲載中のお知らせ」を返す公開エンドポイント
 * GET /api/v1/announcements/active
 *
 * SiteHeader（クライアント）配下の AnnouncementBar から取得する。データ本体は
 * unstable_cache 経由のためDBは基本引かない（毎回の pin 期限/公開判定のみ now で評価）。
 */

import { NextResponse } from "next/server";
import { getBannerAnnouncements } from "@/lib/announcements.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const announcements = await getBannerAnnouncements();
  return NextResponse.json(
    { announcements },
    { headers: { "Cache-Control": "no-store" } }
  );
}
