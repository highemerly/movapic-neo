/**
 * 定期ジョブによる穴埋めポイントの月次付与（サーバー専用・30分ごとの periodic から呼ぶ）。
 *
 * - favor-monthly:   FAVOR_SERVERS 所属ユーザーへ当月分+1pt（登録月のユーザーにも付与）
 * - monthly-catchup: 当月1日より前に登録済みで、先月が皆勤でなかったユーザーへ当月分+1pt（11日以降）
 * - event:<key>:     期間中のイベント（events.ts）の対象者へ、イベントの月の分を付与
 *
 * 「毎月1日／11日ちょうど」ではなく「その日以降で、当月の行がまだ無ければ」付与する。
 * ジョブが止まっていて日付を跨いでも次の実行で拾え、リリースが月初に間に合わなくても自動で追いつく。
 * 二重付与は台帳の @@unique([userId, month, reason]) が弾くので、何度走っても冪等。
 *
 * IO 層なので unit テストの対象外（CLAUDE.md の方針）。日付・付与量の判定は points.ts 側でテストする。
 */

import prisma from "@/lib/db";
import { evaluateAndGrantPerfectMonth } from "@/lib/achievements/engine";
import { perfectMonthKey } from "@/lib/achievements/perfectMonth";
import { getFavorServers } from "@/lib/auth/serverPolicy";
import { jstMonthRangeOfYm, shiftYm, toJstYm } from "@/lib/jst";
import { grantMakeupPoints } from "./ledger";
import { notifyMakeupReadyAfterGrant } from "./notify";
import { MAKEUP_POINT_REASONS, isCatchupOpen, isPointEra, type MakeupPointReason } from "./points";
import { activeMakeupEvents, makeupEventCreatedAtFilter, makeupEventReason } from "./events";

/**
 * 1回の実行で処理する最大ユーザー数（理由ごと）。付与済みのユーザーは次回の候補から外れるので、
 * 取りこぼしは次の30分周期で自然に消化される。catchup は先月分の皆勤判定で月の全画像を読むため、
 * 月初の一斉付与で DB を詰まらせないよう上限を掛ける。
 */
const BATCH = 200;

async function grantAndNotify(
  userId: string,
  ym: string,
  reason: MakeupPointReason,
  now: Date,
  amount = 1
): Promise<boolean> {
  const granted = await grantMakeupPoints({ userId, ym, reason, amount });
  if (granted) {
    await notifyMakeupReadyAfterGrant({ userId, ym, now }).catch((e) =>
      console.error(`[makeup-points] ready notification failed user=${userId}:`, e)
    );
  }
  return granted;
}

/** favor-monthly の付与。付与できた件数を返す。 */
async function grantFavorMonthly(ym: string, now: Date): Promise<number> {
  const favor = getFavorServers();
  if (favor.length === 0) return 0;
  const users = await prisma.user.findMany({
    where: {
      // Instance.domain は保存時に小文字へ正規化済み（normalizeServer）で、getFavorServers も小文字。
      instance: { domain: { in: favor } },
      makeupPointGrants: { none: { month: ym, reason: MAKEUP_POINT_REASONS.FAVOR_MONTHLY } },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  let count = 0;
  for (const u of users) {
    try {
      if (await grantAndNotify(u.id, ym, MAKEUP_POINT_REASONS.FAVOR_MONTHLY, now)) count++;
    } catch (e) {
      console.error(`[makeup-points] favor-monthly failed user=${u.id}:`, e);
    }
  }
  return count;
}

/**
 * monthly-catchup の付与。{ granted: 付与件数, perfect: 先月の皆勤賞をここで確定付与した件数 } を返す。
 *
 * 「先月が皆勤でない」は Achievement 行ではなくデータから判定する。行の付与は編集モード終了時の
 * ビーコン（reevaluate）頼みで、「数値上は皆勤なのに行が無い」状態が11日に存在しうる。行を信じると
 * +1pt を受け取ってから行が付いて👑も取れてしまい、締切が塞いだはずの二重取りが残る。
 * 判定のついでに、成立していて行が無ければここで👑を確定付与する（次回からは候補クエリで除外される）。
 */
async function grantMonthlyCatchup(ym: string, now: Date): Promise<{ granted: number; perfect: number }> {
  const lastYm = shiftYm(ym, -1);
  const { start } = jstMonthRangeOfYm(ym);
  const users = await prisma.user.findMany({
    where: {
      // 先月中に既にアカウントがある＝当月1日(JST)より前に登録
      createdAt: { lt: start },
      makeupPointGrants: { none: { month: ym, reason: MAKEUP_POINT_REASONS.MONTHLY_CATCHUP } },
      // 先月の皆勤賞が確定済みの人は対象外（データ判定で皆勤だった人もここで行が付くので次回から外れる）
      achievements: { none: { key: perfectMonthKey(lastYm) } },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true, instance: { select: { domain: true } } },
  });
  let granted = 0;
  let perfect = 0;
  for (const u of users) {
    try {
      const result = await evaluateAndGrantPerfectMonth({
        userId: u.id,
        instanceDomain: u.instance.domain,
        ym: lastYm,
      });
      if (result.perfect) {
        if (result.granted) perfect++;
        continue;
      }
      if (await grantAndNotify(u.id, ym, MAKEUP_POINT_REASONS.MONTHLY_CATCHUP, now)) granted++;
    } catch (e) {
      console.error(`[makeup-points] monthly-catchup failed user=${u.id}:`, e);
    }
  }
  return { granted, perfect };
}

/**
 * 期間中のイベントの付与。付与できた件数（全イベント合計）を返す。
 * 対象者の条件は DB 側で絞り、台帳に行がある人は候補から外れるので、BATCH ずつ次の実行で消化される。
 */
async function grantEvents(now: Date): Promise<number> {
  let count = 0;
  for (const event of activeMakeupEvents(now)) {
    const reason = makeupEventReason(event.key);
    const users = await prisma.user.findMany({
      where: {
        createdAt: makeupEventCreatedAtFilter(event),
        makeupPointGrants: { none: { month: event.month, reason } },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: { id: true },
    });
    for (const u of users) {
      try {
        if (await grantAndNotify(u.id, event.month, reason, now, event.amount)) count++;
      } catch (e) {
        console.error(`[makeup-points] ${reason} failed user=${u.id}:`, e);
      }
    }
  }
  return count;
}

/**
 * 定期ジョブ本体。ポイント制の月でなければ何もしない。
 * @returns ログ用サマリ（付与が1件も無ければ undefined＝ログを出さない）
 */
export async function runMonthlyMakeupGrants(now: Date = new Date()): Promise<string | undefined> {
  const ym = toJstYm(now);
  if (!isPointEra(ym)) return undefined;

  const favor = await grantFavorMonthly(ym, now);
  const catchup = isCatchupOpen(now) ? await grantMonthlyCatchup(ym, now) : { granted: 0, perfect: 0 };
  const event = await grantEvents(now);

  if (favor === 0 && catchup.granted === 0 && catchup.perfect === 0 && event === 0) return undefined;
  return `ym=${ym} favor=${favor} catchup=${catchup.granted} perfect=${catchup.perfect} event=${event}`;
}
