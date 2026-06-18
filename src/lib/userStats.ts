import prisma from "@/lib/db";
import { calculateStreak } from "@/lib/streak";
import { countRanks } from "@/lib/achievements/catalog";

/**
 * ユーザーページの各タブ（一覧・カレンダー・地図・実績）でも表示している統計値。
 * メニューの「自分の情報」のアイコンバッジと数字を揃えるため1箇所に集約する。
 * いずれも公開画像基準（ユーザーページの表示と一致させる）。
 */
export interface UserProfileStats {
  /** 投稿数（公開画像数） */
  imageCount: number;
  /** 連続投稿日数 */
  streak: number;
  /** 位置情報付き投稿の都道府県数 */
  prefectureCount: number;
  /** 獲得実績数（金ランク） */
  goldCount: number;
  /** 獲得実績数（銀ランク） */
  silverCount: number;
}

export async function getUserProfileStats(userId: string): Promise<UserProfileStats> {
  const [imageCount, postDates, prefectures, achievements] = await Promise.all([
    prisma.image.count({ where: { userId, isPublic: true, isDisabled: false } }),
    prisma.image.findMany({
      where: { userId, isPublic: true, isDisabled: false },
      select: { createdAt: true },
    }),
    prisma.image.findMany({
      where: { userId, isPublic: true, isDisabled: false, locationPrefecture: { not: null } },
      select: { locationPrefecture: true },
      distinct: ["locationPrefecture"],
    }),
    prisma.achievement.findMany({
      where: { userId },
      select: { key: true, category: true },
    }),
  ]);

  const { gold, silver } = countRanks(achievements);

  return {
    imageCount,
    streak: calculateStreak(postDates.map((p) => p.createdAt)),
    prefectureCount: prefectures.length,
    goldCount: gold,
    silverCount: silver,
  };
}
