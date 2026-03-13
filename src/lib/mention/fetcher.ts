/**
 * Mastodon通知取得・since_id管理
 */

import { prisma } from "@/lib/db";

const USER_AGENT = "movapic/1.0";
const REQUEST_TIMEOUT = 30000;

export interface MastodonAccount {
  id: string;
  acct: string; // handon.clubユーザーなら "username"、リモートなら "username@remote.server"
  username: string;
  display_name: string;
  avatar: string;
}

export interface MastodonMediaAttachment {
  id: string;
  type: "image" | "video" | "gifv" | "audio" | "unknown";
  url: string;
  preview_url: string;
  description: string | null;
}

export interface MastodonStatus {
  id: string;
  uri: string; // オリジナル投稿のURI (例: https://handon.club/users/username/statuses/123456)
  content: string; // HTML
  visibility: "public" | "unlisted" | "private" | "direct";
  media_attachments: MastodonMediaAttachment[];
  account: MastodonAccount;
  in_reply_to_id: string | null;
  created_at: string;
}

export interface MastodonNotification {
  id: string;
  type: "mention" | "favourite" | "reblog" | "follow" | "poll" | "status";
  account: MastodonAccount;
  status?: MastodonStatus;
  created_at: string;
}

/**
 * DBからlastNotificationIdを取得
 */
export async function getLastNotificationId(): Promise<string | null> {
  const state = await prisma.botState.findUnique({
    where: { id: "singleton" },
  });
  return state?.lastNotificationId ?? null;
}

/**
 * lastNotificationIdをDBに保存
 */
export async function updateLastNotificationId(notificationId: string): Promise<void> {
  await prisma.botState.upsert({
    where: { id: "singleton" },
    update: { lastNotificationId: notificationId },
    create: { id: "singleton", lastNotificationId: notificationId },
  });
}

/**
 * Mastodon通知を取得
 */
export async function fetchMentionNotifications(
  instanceUrl: string,
  accessToken: string,
  limit: number = 10
): Promise<MastodonNotification[]> {
  const sinceId = await getLastNotificationId();

  const url = new URL(`${instanceUrl}/api/v1/notifications`);
  url.searchParams.set("types[]", "mention");
  url.searchParams.set("limit", String(limit));
  if (sinceId) {
    url.searchParams.set("since_id", sinceId);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`通知の取得に失敗しました: ${response.status} ${error}`);
  }

  const notifications: MastodonNotification[] = await response.json();

  // mentionタイプのみフィルタリング（念のため）
  return notifications.filter((n) => n.type === "mention" && n.status);
}

/**
 * 古いProcessedMentionレコードを削除（90日以上前）
 */
export async function cleanupOldProcessedMentions(): Promise<number> {
  const result = await prisma.processedMention.deleteMany({
    where: {
      createdAt: {
        lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      },
    },
  });
  return result.count;
}
