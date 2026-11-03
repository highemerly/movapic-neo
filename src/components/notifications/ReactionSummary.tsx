"use client";

import type { FavoriteFeedData } from "@/components/layout/useUnseenNotifications";
import { ReactionEmojiView } from "@/components/reaction/ReactionEmojiView";
import { favoriteNotificationOverflow, latestReactionEmojis } from "@/lib/notifications/format";

/**
 * リアクション通知の1行本文（ベルと通知一覧の1行目で共用）。直近の絵文字を件数どおり並べ、
 * 収まらない分は「＋N」。絵文字の無い旧通知は 😊 を1件ぶんとして出す。
 */
export function ReactionSummary({ favorite }: { favorite: FavoriteFeedData | null }) {
  const reactions = latestReactionEmojis(favorite);
  const overflow = favoriteNotificationOverflow(favorite, Math.max(reactions.length, 1));
  return (
    <span className="flex items-center gap-1">
      {reactions.length > 0
        ? reactions.map((r, i) => (
            <ReactionEmojiView key={i} emoji={r.emoji} imageUrl={r.imageUrl} />
          ))
        : "😊"}
      {overflow > 0 && <span className="text-muted-foreground">＋{overflow}</span>}
    </span>
  );
}
