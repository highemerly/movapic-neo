/**
 * 穴埋めポイントのイベント付与の一覧（純粋な静的config）。
 *
 * イベントは台帳に reason = "event:<key>" で付与する（(userId, month, reason) 一意＝1人1回）。
 * 付与は定期ジョブ（monthlyGrants.ts）が「期間中のイベントの対象者のうち、まだ行が無い人」に行う。
 * 表示名（付与履歴・付与通知）はここから引く。
 *
 * 重要な不変条件:
 * - `key` は永続。台帳の reason の一部になるためリネーム・使い回し禁止。
 * - **終わったイベントも消さない**。表示名は表示のたびにここから引くので、消すと過去の付与履歴・通知が
 *   「イベント」表示に戻る。名前を直すと過去分の表示も変わる。
 * - `month` は付与先の月で固定する（ジョブが遅れて月をまたいでも、翌月分のポイントにしないため）。
 *   付与はその月の間だけ行う（ポイントは翌月に持ち越せないので、月をまたいで配る意味が無い）。
 *
 * クライアント（付与履歴の表示）からも import されるため、React・DB・env に依存しないこと。
 * 頻繁にゲリラ開催したくなったら、この一覧を DB（管理画面）に移す。台帳側はそのままでよい。
 */

import { toJstYm } from "@/lib/jst";

/** 対象者の決め方。 */
export type MakeupEventTarget =
  /** 開始時点で登録済みの全ユーザー（期間中に登録した人には配らない）。 */
  "registered-before-start";

export interface MakeupPointEventDef {
  /** 永続キー。台帳の reason "event:<key>" になる（リネーム・使い回し禁止）。 */
  key: string;
  /** 表示名（付与履歴・付与通知に出る）。 */
  name: string;
  /** 付与先の月（JST の "YYYY-MM"）。付与もこの月の間だけ行う。 */
  month: string;
  amount: number;
  /** 付与開始日時（JST のオフセット付き ISO）。この瞬間以降に配る。 */
  start: string;
  target: MakeupEventTarget;
}

export const MAKEUP_POINT_EVENTS: readonly MakeupPointEventDef[] = [
  {
    key: "launch-2026-10",
    name: "穴埋めポイント開始記念",
    month: "2026-10",
    amount: 1,
    start: "2026-10-01T00:00:00+09:00",
    target: "registered-before-start",
  },
];

const EVENT_REASON_PREFIX = "event:";

/** イベントの台帳 reason（"event:<key>"）。 */
export function makeupEventReason(key: string): `event:${string}` {
  return `${EVENT_REASON_PREFIX}${key}`;
}

/** reason からイベント定義を引く。イベントでない・一覧に無いなら null。 */
export function findMakeupEventByReason(
  reason: string,
  events: readonly MakeupPointEventDef[] = MAKEUP_POINT_EVENTS
): MakeupPointEventDef | null {
  if (!reason.startsWith(EVENT_REASON_PREFIX)) return null;
  const key = reason.slice(EVENT_REASON_PREFIX.length);
  return events.find((e) => e.key === key) ?? null;
}

/** 今付与を行うべきイベント（開始済みで、今がその付与先の月の中）。 */
export function activeMakeupEvents(
  now: Date,
  events: readonly MakeupPointEventDef[] = MAKEUP_POINT_EVENTS
): MakeupPointEventDef[] {
  const ym = toJstYm(now);
  return events.filter((e) => e.month === ym && new Date(e.start).getTime() <= now.getTime());
}

/** 対象者の条件を、ユーザー検索の createdAt 条件として返す（DB 側で絞るため）。 */
export function makeupEventCreatedAtFilter(event: MakeupPointEventDef): { lt: Date } {
  switch (event.target) {
    case "registered-before-start":
      return { lt: new Date(event.start) };
  }
}
