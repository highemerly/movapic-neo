"use client";

import type { ReactNode } from "react";
import type { NotificationItem } from "@/components/layout/useUnseenNotifications";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { isMakeupNotificationType, makeupNotificationLines } from "@/lib/makeup/notificationTypes";
import {
  achievementNotificationLines,
  favoriterName,
  reactionNotificationDetail,
} from "@/lib/notifications/format";
import type { NotificationVariant } from "@/lib/notifications/lines";
import {
  REPLY_NOTIFICATION_TITLE,
  REPLY_NOTIFICATION_TYPE,
  replierName,
  replyNotificationDetail,
} from "@/lib/notifications/replyNotificationType";
import {
  WELCOME_BACK_NOTIFICATION_TYPE,
  welcomeBackNotificationLines,
} from "@/lib/notifications/welcomeBackNotificationType";
import {
  MONTHLY_COLLAGE_NOTIFICATION_TYPE,
  monthlyCollageNotificationLines,
} from "@/lib/notifications/monthlyCollageNotificationType";
import { NotificationActors } from "./NotificationActors";
import { ReactionSummary } from "./ReactionSummary";

/** 本文に要る項目だけ（ベルの NotificationItem と通知ページの NotificationFeedItem の共通部分）。 */
type NotificationBodyItem = Pick<
  NotificationItem,
  "type" | "achievementKey" | "favorite" | "makeup" | "reply" | "welcomeBack" | "monthlyCollage"
>;

const CLASSES: Record<NotificationVariant, { title: string; detail: string }> = {
  bell: {
    title: "text-sm font-medium leading-tight",
    detail: "mt-0.5 text-xs leading-snug text-muted-foreground",
  },
  page: {
    title: "text-sm font-medium leading-snug line-clamp-2",
    detail: "mt-1 text-xs leading-snug text-muted-foreground line-clamp-2",
  },
};

function bodyOf(
  n: NotificationBodyItem,
  variant: NotificationVariant
): { title: ReactNode; detail: ReactNode } {
  if (n.type === "favorite") {
    const actors = (n.favorite?.favoriters ?? []).map((f) => ({ ...f, label: favoriterName(f) }));
    return {
      title: <ReactionSummary favorite={n.favorite} />,
      detail: (
        <>
          {actors.length > 0 && <NotificationActors items={actors} />}
          {reactionNotificationDetail(variant, actors.length > 0)}
        </>
      ),
    };
  }
  if (n.type === REPLY_NOTIFICATION_TYPE) {
    const reply = n.reply;
    return {
      title: REPLY_NOTIFICATION_TITLE,
      detail: (
        <>
          {reply && <NotificationActors items={[{ ...reply, label: replierName(reply) }]} />}
          {replyNotificationDetail(variant, reply !== null)}
        </>
      ),
    };
  }
  if (isMakeupNotificationType(n.type)) {
    return makeupNotificationLines(n.type, n.makeup?.point ?? null, variant);
  }
  if (n.type === WELCOME_BACK_NOTIFICATION_TYPE) {
    return welcomeBackNotificationLines(n.welcomeBack, variant);
  }
  if (n.type === MONTHLY_COLLAGE_NOTIFICATION_TYPE) {
    return monthlyCollageNotificationLines(n.monthlyCollage, variant);
  }
  return achievementNotificationLines(
    n.achievementKey ? resolveAchievement(n.achievementKey) : null,
    variant
  );
}

/**
 * 通知の本文2行（ベルと通知ページで共用）。1行目は「絵文字＋要点」、2行目はベルでは短く、
 * 通知ページでは文章にする（文言は各種別のモジュール。形は lib/notifications/lines.ts）。
 * 以前は絵文字・アイコンだけに削りすぎて何の通知か分からなかったため、2行目で必ず言葉にする。
 */
export function NotificationBody({
  n,
  variant,
}: {
  n: NotificationBodyItem;
  variant: NotificationVariant;
}) {
  const { title, detail } = bodyOf(n, variant);
  return (
    <>
      <p className={CLASSES[variant].title}>{title}</p>
      <p className={CLASSES[variant].detail}>{detail}</p>
    </>
  );
}
