/**
 * 投稿レート制限（ユーザー単位）。/api/v1/post での連投・自動化投稿を抑制する。
 *
 * 2つの上限を同時に課す:
 *  1. 直近15分あたり MAX_PER_15MIN 投稿まで（短時間の連投を抑える）
 *  2. 直近24時間あたり (BASE_PER_24H + floor(直近7日の投稿数 / 7) * 2) 投稿まで
 *     （活発なユーザーほど24時間の上限が上がる＝日頃使っている人ほど緩い）
 *
 * 画像は投稿時に必ず DB へ永続化されるため、履歴カウントは Image テーブルの
 * 1クエリで求める。in-memory にしないのは、24時間・7日という長いウィンドウを
 * Pod 再起動をまたいで正しく保持する必要があるため（式が週次履歴に依存する）。
 * 投稿は低頻度で、@@index([userId, createdAt]) が効くため負荷は無視できる。
 */

import prisma from "@/lib/db";

const MIN_15_MS = 15 * 60 * 1000;
const HOUR_24_MS = 24 * 60 * 60 * 1000;
const DAY_7_MS = 7 * 24 * 60 * 60 * 1000;

// NOTE: 15分あたりの上限は将来的に環境変数へ切り出す想定（公開リポジトリで閾値を隠すため）。現状はハードコード。
const MAX_PER_15MIN = 10;
const BASE_PER_24H = 15;

export interface PostRateLimitResult {
  allowed: boolean;
  /** 拒否時、次に投稿できるまでの秒数 */
  retryAfter?: number;
}

/**
 * ユーザーの投稿レート制限を判定する。新しい投稿を「まだ作成していない」時点で呼ぶ前提。
 */
export async function checkPostRateLimit(userId: string): Promise<PostRateLimitResult> {
  const now = Date.now();

  // 7日ウィンドウ（最長）を1回だけ取得し、全ウィンドウをこの配列から算出する。
  const rows = await prisma.image.findMany({
    where: { userId, createdAt: { gte: new Date(now - DAY_7_MS) } },
    select: { createdAt: true },
  });
  const times = rows.map((r) => r.createdAt.getTime());

  const recent15 = times.filter((t) => t > now - MIN_15_MS);
  if (recent15.length >= MAX_PER_15MIN) {
    // 最古の記録がウィンドウから外れれば1枠空く
    const oldest = Math.min(...recent15);
    return { allowed: false, retryAfter: Math.ceil((oldest + MIN_15_MS - now) / 1000) };
  }

  const recent24h = times.filter((t) => t > now - HOUR_24_MS);
  const weekCount = times.length;
  const limit24h = BASE_PER_24H + Math.floor(weekCount / 7) * 2;
  if (recent24h.length >= limit24h) {
    const oldest = Math.min(...recent24h);
    return { allowed: false, retryAfter: Math.ceil((oldest + HOUR_24_MS - now) / 1000) };
  }

  return { allowed: true };
}
