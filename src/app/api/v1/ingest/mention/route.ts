/**
 * メンション取り込みエンドポイント（producer）
 * POST /api/v1/ingest/mention（旧 /api/v1/mention-process）。CronJob/将来のstreamingから呼ばれる。
 *
 * ここでは Mastodon 通知を fetch して Graphile Worker に enqueue するだけ。
 * 実際の画像処理・投稿は worker(consumer) 側の process-mention タスクで実行される。
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { pollAndEnqueueMentions } from "@/lib/mention/ingest";

const getBotInstanceUrl = () => process.env.MASTODON_BOT_INSTANCE_URL || "https://handon.club";
const getBotAccessToken = () => process.env.MASTODON_BOT_ACCESS_TOKEN || "";
const getMentionProcessApiKey = () => process.env.MENTION_PROCESS_API_KEY || "";

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

  // タイミング攻撃対策のため、長さチェック + timingSafeEqual で比較
  const apiKeyBuf = Buffer.from(apiKey ?? "");
  const expectedApiKeyBuf = Buffer.from(expectedApiKey);
  if (
    apiKeyBuf.length !== expectedApiKeyBuf.length ||
    !timingSafeEqual(apiKeyBuf, expectedApiKeyBuf)
  ) {
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
    // 通知を取得して enqueue（streaming のキャッチアップと共通ロジック）
    const { enqueued, failed, cleaned } = await pollAndEnqueueMentions(
      botInstanceUrl,
      botAccessToken,
      10
    );

    if (cleaned > 0) {
      console.log(`[mention-process] Cleaned up ${cleaned} old records`);
    }

    const duration = Date.now() - startTime;
    if (enqueued > 0 || failed > 0) {
      console.log(`[mention-process] Done: enqueued=${enqueued}, failed=${failed}, duration=${duration}ms`);
    }

    return NextResponse.json({
      success: true,
      enqueued,
      failed,
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
