/**
 * 皆勤賞 grace（未投稿許容日数）のインスタンスドメイン別解決（サーバー専用）。
 * env FAVOR_SERVERS を読むため perfectMonth.ts（クライアント共有・純粋モジュール）から分離。
 *
 * **2026-09 以前の月専用**。2026-10 以降の月の上限は穴埋めポイントの台帳で決まるので、
 * 月を問わず上限が欲しいときは `resolveMakeupCap`（@/lib/makeup/ledger）を使うこと。
 * ここを直接呼んでよいのは、ledger 自身と、従来ルールの月だけを扱う backfill スクリプト。
 */

import { isFavorServer } from "@/lib/auth/serverPolicy";
import {
  PERFECT_MONTH_GRACE_FAVORED,
  PERFECT_MONTH_GRACE_DEFAULT,
} from "@/lib/achievements/perfectMonth";

/** インスタンスドメインに応じた未投稿許容日数（穴埋め枠）を返す。 */
export function perfectMonthGrace(instanceDomain: string | null | undefined): number {
  return isFavorServer(instanceDomain) ? PERFECT_MONTH_GRACE_FAVORED : PERFECT_MONTH_GRACE_DEFAULT;
}
