/**
 * 「先月の月次画像を作れます」通知の作成（サーバー専用・30分ごとの periodic から呼ぶ）。
 * type・遷移先・文言は monthlyCollageNotificationType.ts。
 *
 * 月の判定は全員共通の時計（LATEST_CLOCK＝4時区切り）で行う。月は人によって始まる時刻が違う
 * （日付の区切り 0〜4 時）ので、1日 4:00 JST を過ぎてから送る＝全員の先月が終わってから
 * （区切りの遅い人の 1日 1:00 の投稿はまだ先月の記録日で、先に送ると対象から漏れうる）。
 *
 * 「毎月1日ちょうど」ではなく「当月に入っていて、先月分をまだ送っていなければ」送る
 * （makeup-points と同じ方式）。ジョブが止まって日付を跨いでも次の実行で拾う。対象（先月に投稿した人）は
 * 月が終わった時点で確定するので、遅れて送っても対象がずれない。
 *
 * IO 層なので unit テストの対象外（CLAUDE.md の方針）。id・文言・遷移先は monthlyCollageNotificationType.ts 側でテストする。
 */

import prisma from "@/lib/db";
import { firstDayOfYm, lastDayOfYm } from "@/lib/dayClock";
import { postDateBetween } from "@/lib/dayClock.server";
import {
  MONTHLY_COLLAGE_NOTIFICATION_TYPE,
  monthlyCollageCycle,
  monthlyCollageNotificationId,
  type MonthlyCollageNotificationData,
} from "./monthlyCollageNotificationType";

/**
 * 1回の実行で通知するユーザー数の上限。送り済みのユーザーは次回の候補から外れるので、
 * 残りは次の30分周期で消化される（月初の一斉作成で DB を詰まらせない）。
 */
const BATCH = 200;

/**
 * 先月に投稿したユーザーへ、先月の月次画像の通知を作る。サマリ（作成件数）を返す。
 * 「投稿した」はカレンダーに出る写真（公開・非表示でない）で数える＝通知から開いたカレンダーが空にならない。
 * 月は記録日（カレンダーと同じ）で決める。
 */
export async function runMonthlyCollageNotifications(now: Date = new Date()): Promise<string | void> {
  // 対象月とこの周期の始まり（当月1日 4:00 JST）は純粋関数で決める（テスト済み）。
  const { ym, cycleStart: thisCycleStart } = monthlyCollageCycle(now);

  const users = await prisma.user.findMany({
    where: {
      images: {
        some: {
          postDate: postDateBetween(firstDayOfYm(ym), lastDayOfYm(ym)),
          isPublic: true,
          isDisabled: false,
        },
      },
      // この周期に作った monthly-collage は必ず先月分（作るのは先月分だけ）。候補を絞る最適化で、
      // 二重作成そのものは決定的な id（skipDuplicates）が弾く。
      notifications: {
        none: { type: MONTHLY_COLLAGE_NOTIFICATION_TYPE, createdAt: { gte: thisCycleStart } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  if (users.length === 0) return;

  const data: MonthlyCollageNotificationData = { ym };
  const { count } = await prisma.notification.createMany({
    data: users.map((u) => ({
      id: monthlyCollageNotificationId(u.id, ym),
      userId: u.id,
      type: MONTHLY_COLLAGE_NOTIFICATION_TYPE,
      data: { ...data },
    })),
    skipDuplicates: true,
  });
  return `ym=${ym} created=${count}/${users.length}`;
}
