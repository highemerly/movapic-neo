/**
 * リプライ通知の作成。仕様の全体は docs/reply.md。
 *
 * 通知の imageId は「リプライ側の画像」を指す。送信者（リプライ画像の投稿者）・削除（SET NULL）・
 * 取り下げ・ミュートはすべてこのリレーションから読み取り時に導出するため、data は持たない。
 * ミュートは書き込み時には見ない（読み取り時に muter の視界から落とす＝ミュートされた側に分からない）。
 */

import prisma from "@/lib/db";
import { REPLY_NOTIFICATION_TYPE } from "./replyNotificationType";

/**
 * 親画像の投稿者へリプライ通知を作る。自分の投稿へのリプライ（セルフスレッド・「連」）は通知しない。
 * id を決定的にして upsert する: 同じリプライで2回呼ばれても（再試行など）通知を重複させないため。
 */
export async function createReplyNotification(params: {
  replyImageId: string;
  replierUserId: string;
  parentImageId: string;
}): Promise<void> {
  const parent = await prisma.image.findUnique({
    where: { id: params.parentImageId },
    select: { userId: true },
  });
  if (!parent || parent.userId === params.replierUserId) return;

  const id = `reply-${params.replyImageId}`;
  await prisma.notification.upsert({
    where: { id },
    create: {
      id,
      userId: parent.userId,
      type: REPLY_NOTIFICATION_TYPE,
      imageId: params.replyImageId,
    },
    update: {},
  });
}
