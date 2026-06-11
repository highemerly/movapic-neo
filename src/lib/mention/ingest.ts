/**
 * メンションの取り込み（fetch → enqueue）共通ロジック。
 *
 * cron 経由の producer（/api/v1/ingest/mention）と、streaming 接続時のキャッチアップ
 * （src/lib/mention/streamer.ts）の双方から呼ばれる。重い画像処理・投稿は
 * Graphile Worker の process-mention タスク側で実行される。
 */

import {
  fetchMentionNotifications,
  updateLastNotificationId,
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

  // lastNotificationId を即座に更新（最新のnotification.id）。
  // 通知は新しい順で返されるので、最初の要素が最新。
  await updateLastNotificationId(notifications[0].id);

  // 古い順に enqueue（dedup は jobKey=mention:statusId で担保）
  let enqueued = 0;
  let failed = 0;
  for (const notification of notifications.reverse()) {
    try {
      await enqueueMention({ notification });
      enqueued++;
    } catch (error) {
      failed++;
      console.error(`[mention-ingest] enqueue failed for ${notification.id}:`, error);
    }
  }

  const cleaned = await cleanupOldProcessedMentions();
  return { enqueued, failed, cleaned };
}
