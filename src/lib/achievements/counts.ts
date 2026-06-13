/**
 * ユーザーの獲得実績を金/銀ランクで集計する（ユーザーページのメタ行用）。
 */

import prisma from "@/lib/db";
import { countRanks } from "./catalog";

export async function getRankCounts(
  userId: string
): Promise<{ gold: number; silver: number }> {
  const rows = await prisma.achievement.findMany({
    where: { userId },
    select: { key: true, category: true },
  });
  return countRanks(rows);
}
