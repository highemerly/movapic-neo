/**
 * 穴埋めポイント制の純粋ロジック（しきい値・付与量・締切・残高計算）。
 *
 * 「穴埋めポイント」は 1pt = 1日ぶんの穴埋め。ユーザーごと・月ごとに可変の上限で、
 * 従来の固定 grace（通常3日 / FAVOR_SERVERS 所属4日）を 2026-10 分から置き換える。
 *
 * **不変条件（ここを壊すと過去月の皆勤賞👑が揺れる）**
 * - ポイントは付与のみ（台帳は追記専用）。月内は単調非減少で、月が終われば凍結する。
 *   だから過去月を何度再評価しても cap が変わらず、確定した👑が後から覆らない。
 *   **剥奪・マイナス補正は禁止**。
 * - 消費は台帳に持たず `Image.makeupTargetDay` から導出する。ポイントは「消費」ではなく
 *   「占有」で、穴埋めを解除すれば同月内で再利用できる（締切後は不可）。
 *
 * catalog.ts / perfectMonth.ts と同じくクライアントからも import されうるため、
 * React・サーバー専用 API・env を import しないこと（型・純粋関数のみ）。
 * DB を見る側は `@/lib/makeup/ledger`（サーバー専用）。
 */

import { formatYm, parseYm, shiftYm } from "@/lib/jst";

/**
 * ポイント制を適用する最初の月（JST）。これ未満の月は従来の grace（3/4日）で判定する。
 * 2026-09 以前の実績・穴埋めを一切変えないための境界。
 */
export const MAKEUP_POINT_START_YM = "2026-10";

/**
 * 穴埋めの締切日（対象月の翌月の、この日まで）。
 * これが無いと「毎月11日に+1pt（先月が皆勤でなかった人）」を受け取ってから先月を穴埋めして
 * 👑も取る、という二重取りが成立してしまう。
 */
export const MAKEUP_DEADLINE_DAY = 10;

/** 新規登録時に付与するポイントの上限（登録が10日以降なら一律この値）。 */
export const SIGNUP_POINT_MAX = 8;

/** ポイントの付与理由。`event:<キー>` だけは可変（同月に複数回付与できるようにするため）。 */
export const MAKEUP_POINT_REASONS = {
  /** FAVOR_SERVERS 所属ユーザーへ毎月1日（登録月は登録時）に+1pt。 */
  FAVOR_MONTHLY: "favor-monthly",
  /** 先月中に既にアカウントがあり、先月が皆勤でなかったユーザーへ毎月11日に+1pt。 */
  MONTHLY_CATCHUP: "monthly-catchup",
  /** 新規登録時。登録日に応じて 0〜8pt。 */
  SIGNUP: "signup",
  /** その月に実績を1つでも達成したとき+1pt（月1回まで）。 */
  ACHIEVEMENT: "achievement",
} as const;

export type MakeupPointReason =
  | (typeof MAKEUP_POINT_REASONS)[keyof typeof MAKEUP_POINT_REASONS]
  | `event:${string}`;

/** 台帳1行ぶん（表示・集計に必要な最小限）。 */
export interface MakeupPointGrantLike {
  reason: string;
  amount: number;
}

/** その月がポイント制の対象か。"YYYY-MM" は辞書順＝時系列順なので文字列比較で足りる。 */
export function isPointEra(ym: string): boolean {
  return ym >= MAKEUP_POINT_START_YM;
}

/**
 * 新規登録時の付与ポイント。登録日(JST)の「前日までの日数」＝その月に既に過ぎた日数ぶんを配る。
 * 2日登録=+1（1日を埋められる）／9日登録=+8（1〜8日を埋められる）で初月の皆勤賞に手が届き、
 * 10日以降の登録は上限8ptに対し穴が9日以上あるため初月の皆勤賞は構造的に取れない。
 * 1日登録は0pt（まだ過ぎた日が無く、そのまま毎日投稿すれば皆勤できる）。
 */
export function signupPointAmount(jstDay: number): number {
  return Math.min(Math.max(jstDay - 1, 0), SIGNUP_POINT_MAX);
}

/**
 * その月の穴埋め締切（この時刻より前なら編集可）。翌月11日 JST 00:00 を UTC Date で返す
 * ＝「翌月10日 23:59:59.999 JST まで」を排他上限で表したもの（ミリ秒の取りこぼしが無い）。
 */
export function makeupDeadline(ym: string): Date {
  const { year, month } = parseYm(shiftYm(ym, 1));
  return new Date(Date.UTC(year, month - 1, MAKEUP_DEADLINE_DAY + 1, -9, 0, 0));
}

/**
 * その月の穴埋め（割当の指定・解除）がまだ可能か。新旧era 共通で適用する。
 * 未来月も false（まだ穴の概念が無い）。
 */
export function isMakeupEditable(ym: string, now: Date): boolean {
  if (now.getTime() >= makeupDeadline(ym).getTime()) return false;
  // 未来月は編集させない（対象月がまだ始まっていない）。
  return ym <= currentYm(now);
}

/** now(JST) の年月。`toJstYm` の薄いラッパ（このモジュール内で完結させるため再輸出しない）。 */
function currentYm(now: Date): string {
  const t = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return formatYm(t.getUTCFullYear(), t.getUTCMonth() + 1);
}

/** 台帳行の合計＝その月の cap（穴埋めできる上限日数）。 */
export function sumGrants(grants: ReadonlyArray<MakeupPointGrantLike>): number {
  let total = 0;
  for (const g of grants) total += g.amount;
  return total;
}

/** その月にその理由の付与が既にあるか。 */
export function hasGrant(
  grants: ReadonlyArray<MakeupPointGrantLike>,
  reason: MakeupPointReason
): boolean {
  return grants.some((g) => g.reason === reason);
}

/**
 * 「その月にまだ付与されうる分」も含めた上限（`potentialCap`）。
 *
 * cap をそのまま「達成可能性」の判定に使うと、月初10日間に cap=0 のユーザーが1日でも
 * 投稿を忘れた瞬間に「今月は達成できません」となり、カレンダーのコールアウトも穴埋め通知も
 * 消えてしまう（11日に+1ptが来るまで、穴を忘れたことすら知らされない）。
 * 「今使える枠(cap)」と「達成可能性(potentialCap)」を分けるのはこのため。
 *
 * potentialCap は割当の可否には**使わない**（実際に埋められるのは cap まで）。
 */
export function potentialCapOf(args: {
  grants: ReadonlyArray<MakeupPointGrantLike>;
  /** JST の今日の日(1-31)。対象月が当月でないときは呼ばない（過去月は cap が確定済み）。 */
  todayDayNum: number;
  /** このユーザーが monthly-catchup の対象か（先月中に既にアカウントがある）。 */
  catchupEligible: boolean;
}): number {
  const { grants, todayDayNum, catchupEligible } = args;
  let potential = sumGrants(grants);
  // 11日より前なら catchup がまだ来る可能性がある。
  if (
    catchupEligible &&
    todayDayNum <= MAKEUP_DEADLINE_DAY &&
    !hasGrant(grants, MAKEUP_POINT_REASONS.MONTHLY_CATCHUP)
  ) {
    potential += 1;
  }
  // 実績+1pt は月内いつでも取りうる（月1回まで）。
  if (!hasGrant(grants, MAKEUP_POINT_REASONS.ACHIEVEMENT)) potential += 1;
  return potential;
}

/** 残高＝cap − 既に埋めている有効な穴の数。負にはしない。 */
export function remainingPoints(cap: number, filledHoleCount: number): number {
  return Math.max(0, cap - filledHoleCount);
}
