/**
 * 皆勤賞 grace（未投稿許容日数）のインスタンスドメイン別解決（サーバー専用）。
 * env FAVOR_SERVERS を読むため perfectMonth.ts（クライアント共有・純粋モジュール）から分離。
 */

import { getFavorServers } from "@/lib/auth/serverPolicy";
import {
  PERFECT_MONTH_GRACE_FAVORED,
  PERFECT_MONTH_GRACE_DEFAULT,
} from "@/lib/achievements/perfectMonth";

/** インスタンスドメインに応じた未投稿許容日数（穴埋め枠）を返す。 */
export function perfectMonthGrace(instanceDomain: string | null | undefined): number {
  return instanceDomain && getFavorServers().includes(instanceDomain.toLowerCase())
    ? PERFECT_MONTH_GRACE_FAVORED
    : PERFECT_MONTH_GRACE_DEFAULT;
}
