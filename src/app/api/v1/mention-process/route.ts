/**
 * メンション処理APIエンドポイント
 * CronJobから定期的に呼び出される
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchMentionNotifications,
  updateLastNotificationId,
  cleanupOldProcessedMentions,
} from "@/lib/mention/fetcher";
import { processOneMention } from "@/lib/mention/processor";

const getBotInstanceUrl = () => process.env.MASTODON_BOT_INSTANCE_URL || "https://handon.club";
const getBotAccessToken = () => process.env.MASTODON_BOT_ACCESS_TOKEN || "";
const getMentionProcessApiKey = () => process.env.MENTION_PROCESS_API_KEY || "";

// 1回のCronJobにつき、ユーザーあたりの最大処理数
const MAX_MENTIONS_PER_USER = 3;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // 認証チェック
  const apiKey = request.headers.get("X-API-Key");
  const expectedApiKey = getMentionProcessApiKey();

  if (!expectedApiKey) {
    console.error("[mention-process] MENTION_PROCESS_API_KEY is not configured");
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 }
    );
  }

  if (apiKey !== expectedApiKey) {
    console.error("[mention-process] Invalid API key");
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const botInstanceUrl = getBotInstanceUrl();
  const botAccessToken = getBotAccessToken();

  if (!botAccessToken) {
    console.error("[mention-process] MASTODON_BOT_ACCESS_TOKEN is not configured");
    return NextResponse.json(
      { success: false, error: "Bot token not configured" },
      { status: 500 }
    );
  }

  try {
    // 通知を取得
    console.log(`[mention-process] Fetching notifications from ${botInstanceUrl}`);
    const notifications = await fetchMentionNotifications(botInstanceUrl, botAccessToken, 10);
    console.log(`[mention-process] Fetched ${notifications.length} notifications`);

    if (notifications.length === 0) {
      // クリーンアップは実行
      const cleanedCount = await cleanupOldProcessedMentions();
      if (cleanedCount > 0) {
        console.log(`[mention-process] Cleaned up ${cleanedCount} old records`);
      }

      return NextResponse.json({
        success: true,
        processed: 0,
        skipped: 0,
        failed: 0,
        duration: Date.now() - startTime,
      });
    }

    // lastNotificationIdを即座に更新（最新のnotification.id）
    // 通知は新しい順で返されるので、最初の要素が最新
    const latestNotificationId = notifications[0].id;
    await updateLastNotificationId(latestNotificationId);
    console.log(`[mention-process] Updated lastNotificationId to ${latestNotificationId}`);

    // 各通知を処理（古い順に処理するため逆順）
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let rateLimited = 0;

    // ユーザーごとの処理数をカウント
    const userProcessCount = new Map<string, number>();

    for (const notification of notifications.reverse()) {
      const userAcct = notification.account.acct;

      // ユーザーごとの制限をチェック
      const currentCount = userProcessCount.get(userAcct) || 0;
      if (currentCount >= MAX_MENTIONS_PER_USER) {
        rateLimited++;
        console.log(`[mention-process] Rate limited ${notification.id}: user @${userAcct} exceeded ${MAX_MENTIONS_PER_USER} mentions per batch`);
        continue;
      }

      try {
        console.log(`[mention-process] Processing notification ${notification.id} from @${userAcct}`);
        const result = await processOneMention(notification);

        if (result.skipped) {
          skipped++;
          console.log(`[mention-process] Skipped ${notification.id}: already processed`);
        } else if (result.success) {
          processed++;
          userProcessCount.set(userAcct, currentCount + 1);
          console.log(`[mention-process] Success ${notification.id}`);
        } else {
          failed++;
          console.log(`[mention-process] Failed ${notification.id}: ${result.error}`);
        }
      } catch (error) {
        failed++;
        console.error(`[mention-process] Error processing ${notification.id}:`, error);
      }
    }

    // 古いProcessedMentionをクリーンアップ
    const cleanedCount = await cleanupOldProcessedMentions();
    if (cleanedCount > 0) {
      console.log(`[mention-process] Cleaned up ${cleanedCount} old records`);
    }

    const duration = Date.now() - startTime;
    console.log(`[mention-process] Done: processed=${processed}, skipped=${skipped}, failed=${failed}, rateLimited=${rateLimited}, duration=${duration}ms`);

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      failed,
      rateLimited,
      duration,
    });
  } catch (error) {
    console.error("[mention-process] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
