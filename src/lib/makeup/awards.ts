/**
 * 穴埋めポイントの「イベント起点」の付与（サーバー専用）。
 *
 * - 新規登録時: signup（登録日で 0〜8pt）＋ FAVOR_SERVERS 所属なら favor-monthly(+1)
 * - 実績を1つでも付与した瞬間: achievement(+1・月1回)
 * 定期ジョブ起点（favor-monthly の月次・monthly-catchup）は src/lib/periodic 側。
 *
 * どれも付与の成否でログイン・投稿・リアクションを止めてはいけないので、呼び出し側で .catch する。
 */

import { isFavorServer } from "@/lib/auth/serverPolicy";
import { jstDayOf, toJstYm } from "@/lib/jst";
import { grantMakeupPoints } from "./ledger";
import { notifyMakeupReadyAfterGrant } from "./notify";
import { MAKEUP_POINT_REASONS, isPointEra, signupPointAmount } from "./points";

/**
 * 新規登録時の付与。OAuth コールバックで User を作成した直後に呼ぶ。
 * FAVOR_SERVERS 所属なら当月分の favor-monthly もここで即時に付与する（定期ジョブの30分待ちを
 * させない）。定期ジョブ側で再度付与を試みても @@unique が弾くので二重にはならない。
 * 1日登録は signup が0pt で行を作らないが、favor-monthly は付く（月途中登録にも付与する方針）。
 */
export async function grantSignupMakeupPoints(args: {
  userId: string;
  instanceDomain: string;
  now: Date;
}): Promise<void> {
  const { userId, instanceDomain, now } = args;
  const ym = toJstYm(now);
  if (!isPointEra(ym)) return;

  await grantMakeupPoints({
    userId,
    ym,
    reason: MAKEUP_POINT_REASONS.SIGNUP,
    amount: signupPointAmount(jstDayOf(now)),
  });
  if (isFavorServer(instanceDomain)) {
    await grantMakeupPoints({ userId, ym, reason: MAKEUP_POINT_REASONS.FAVOR_MONTHLY, amount: 1 });
  }
  // 登録直後は投稿0枚なので「今すぐ穴埋め」は出ない（呼ぶ必要が無い）。
}

/**
 * 実績を1件以上付与した直後に呼ぶ。当月の achievement ポイント(+1)を付与する（月1回）。
 * 実績付与の経路は engine.grantAll と calendar/reevaluate の2つがあり、両方から呼ぶこと
 * （reevaluate は grantAll を通らないため、片方だけだと皆勤賞経由の+1ptが漏れる）。
 * backfill（過去日の実績の一括付与）からは呼ばない＝ポイントは遡及しない。
 */
export async function maybeGrantAchievementPoint(args: {
  userId: string;
  now: Date;
}): Promise<void> {
  const { userId, now } = args;
  const ym = toJstYm(now);
  if (!isPointEra(ym)) return;
  const granted = await grantMakeupPoints({
    userId,
    ym,
    reason: MAKEUP_POINT_REASONS.ACHIEVEMENT,
    amount: 1,
  });
  if (granted) await notifyMakeupReadyAfterGrant({ userId, ym, now });
}
