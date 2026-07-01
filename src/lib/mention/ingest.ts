/**
 * メンションの取り込み（fetch → enqueue）共通ロジック。
 *
 * 定期ジョブ（crontab の periodic タスク。src/lib/periodic/index.ts）と、streaming
 * 接続時のキャッチアップ（src/lib/mention/streamer.ts）の双方から呼ばれる。重い画像処理・
 * 投稿は Graphile Worker の process-mention タスク側で実行される。
 */

import {
  fetchMentionNotifications,
  advanceLastNotificationId,
  cleanupOldProcessedMentions,
} from "./fetcher";
import { enqueueMention } from "@/lib/queue";

export interface PollResult {
  enqueued: number;
  failed: number;
  cleaned: number;
}

/**
 * since_id 以降のメンション通知を取得して Graphile Worker に enqueue する。
 * dedup は jobKey=mention:statusId で担保されるため、cron と streaming で
 * 同一メンションが二重投入されても安全。
 */
export async function pollAndEnqueueMentions(
  instanceUrl: string,
  accessToken: string,
  limit: number = 10
): Promise<PollResult> {
  const notifications = await fetchMentionNotifications(instanceUrl, accessToken, limit);

  if (notifications.length === 0) {
    const cleaned = await cleanupOldProcessedMentions();
    return { enqueued: 0, failed: 0, cleaned };
  }

  // 古い順に全件 enqueue（dedup は jobKey=mention:statusId で担保）。
  // since_id の前進は enqueue "後" に、かつ「古い方から連続成功したところまで」だけ進める。
  // これにより enqueue に失敗した通知（と、それより新しい通知）を次回ポーリングで
  // 必ず再取得できる。失敗以降も enqueue は継続するので新しい通知が遅延せず、再取得で
  // 重複する成功済み分は jobKey で dedup されるため二重投稿しない。
  // 前進を enqueue より先にすると、失敗した通知を since_id が飛び越して恒久的に取りこぼす。
  let enqueued = 0;
  let failed = 0;
  let gapSeen = false;
  let highWaterMark: string | null = null;
  for (const notification of notifications.reverse()) {
    try {
      await enqueueMention({ notification });
      enqueued++;
      // 先頭から一度も失敗していない間だけ高水位を進める（連続成功プレフィックス）。
      if (!gapSeen) highWaterMark = notification.id;
    } catch (error) {
      failed++;
      gapSeen = true;
      console.error(`[mention-ingest] enqueue failed for ${notification.id}:`, error);
    }
  }

  // 連続成功した末尾まで、monotonic に前進（streaming が進めた高水位を巻き戻さない）。
  if (highWaterMark) {
    await advanceLastNotificationId(highWaterMark);
  }

  const cleaned = await cleanupOldProcessedMentions();
  return { enqueued, failed, cleaned };
}
