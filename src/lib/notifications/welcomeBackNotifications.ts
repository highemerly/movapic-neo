/**
 * 「おかえり」通知の作成（サーバー専用）。type・判定・文言は welcomeBackNotificationType.ts。
 *
 * 投稿後のフック（publishImage の afterSaved）から呼ぶ＝web・メール・Bot の全経路で作られる。
 * Web 投稿は投稿直後の画面でトーストも出すが、メール・Bot には投稿直後の画面が無く、通知でしか伝わらない。
 */

import prisma from "@/lib/db";
import { fromDbDate } from "@/lib/dayClock.server";
import {
  WELCOME_BACK_NOTIFICATION_TYPE,
  welcomeBackDays,
  welcomeBackNotificationId,
  type WelcomeBackNotificationData,
} from "./welcomeBackNotificationType";

/**
 * この投稿がしばらく空いた後の投稿なら、本人へ「おかえり」通知を作る。
 * 前回の投稿は「この投稿より前に作られた本人の投稿」で引く（同時に別経路で投稿されても、自分より後の
 * 投稿を前回とみなさない）。id を決定的にして upsert するので、同じ投稿で2回呼ばれても重複しない。
 */
export async function createWelcomeBackNotification(params: {
  userId: string;
  imageId: string;
}): Promise<void> {
  const image = await prisma.image.findUnique({
    where: { id: params.imageId },
    select: { createdAt: true, postDate: true },
  });
  if (!image) return;
  const previous = await prisma.image.findFirst({
    where: { userId: params.userId, id: { not: params.imageId }, createdAt: { lt: image.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { postDate: true },
  });
  const days = welcomeBackDays(
    previous ? fromDbDate(previous.postDate) : null,
    fromDbDate(image.postDate)
  );
  if (days === null) return;

  const id = welcomeBackNotificationId(params.imageId);
  const data: WelcomeBackNotificationData = { days };
  await prisma.notification.upsert({
    where: { id },
    create: {
      id,
      userId: params.userId,
      type: WELCOME_BACK_NOTIFICATION_TYPE,
      imageId: params.imageId,
      data: { ...data },
    },
    update: {},
  });
}
