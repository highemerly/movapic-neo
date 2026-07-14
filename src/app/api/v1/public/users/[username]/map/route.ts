/**
 * 都道府県別投稿数の集計API
 * GET /api/v1/public/users/[username]/map
 *
 * locationPrefecture が non-null な公開画像を都道府県別にカウントし、
 * 各都道府県の最新画像（サムネイル表示用）も含めて返す。
 * 対象ユーザーが showLocationMap=false の場合、本人を含め 403 を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseUserHandle } from "@/lib/userHandle";

interface PrefectureEntry {
  count: number;
  latest: {
    id: string;
    thumbnailKey: string | null;
    storageKey: string;
    position: string;
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    // username@domain で解決（domain 省略時は既定インスタンス）
    const { username: cleanUsername, domain } = parseUserHandle(username);
    const user = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
        instance: {
          domain,
        },
      },
      select: { id: true, showLocationMap: true },
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    // 未公開なら本人を含めアクセス不可
    if (!user.showLocationMap) {
      return NextResponse.json(
        { error: "このユーザーは地図機能を公開していません" },
        { status: 403 }
      );
    }

    // 都道府県付き画像を新しい順に取得し、JSで都道府県別にグルーピング
    // 各都道府県の最新画像（サムネイル表示用）も同時に得るため findMany + reduce で実装
    const images = await prisma.image.findMany({
      where: {
        userId: user.id,
        isPublic: true,
        isDisabled: false,
        locationPrefecture: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        thumbnailKey: true,
        storageKey: true,
        position: true,
        locationPrefecture: true,
      },
    });

    const data: Record<string, PrefectureEntry> = {};
    let total = 0;
    for (const img of images) {
      const pref = img.locationPrefecture;
      if (!pref) continue;
      if (!data[pref]) {
        data[pref] = {
          count: 0,
          latest: {
            id: img.id,
            thumbnailKey: img.thumbnailKey,
            storageKey: img.storageKey,
            position: img.position,
          },
        };
      }
      data[pref].count++;
      total++;
    }

    return NextResponse.json({
      data,
      total,
      prefectureCount: Object.keys(data).length,
      isOptedIn: user.showLocationMap,
    });
  } catch (error) {
    console.error("Failed to load map data:", error);
    return NextResponse.json(
      { error: "地図データの取得に失敗しました" },
      { status: 500 }
    );
  }
}
