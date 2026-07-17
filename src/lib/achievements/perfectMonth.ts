/**
 * 皆勤賞ロジックの単一ソース（しきい値・判定式・進捗・穴埋め通知ゲートを集約）。
 *
 * 「皆勤賞」は『未投稿を grace 日まで許容し、その分を同月の "後日" に
 * 2枚以上投稿（＝ダブル投稿）して穴埋めできる』制度。穴埋めは「忘れた過去日」を
 * 「それより後の日のダブル投稿」で埋めるもので、ダブル投稿日 D は D より前の未投稿日のみ
 * 埋められる（将来日は埋められない＝月末日を忘れると後日が無く埋まらない）。1日のダブルは
 * 1日分のみ埋める。判定の中核を1箇所に集め、live(stats/engine) / backfill / カレンダーAPI /
 * 穴埋め通知 の4経路がすべてここを呼ぶ。
 *
 * catalog.ts と同じく「サーバー/クライアント両方から import されうる」ため、
 * React・サーバー専用 API を import しないこと（型・純粋関数のみ）。
 */

/** 皆勤賞の系列キー（DBの category 列）。動的キーは "perfect-month:YYYY-MM"。 */
export const PERFECT_MONTH_CATEGORY = "perfect-month";

/**
 * 未投稿として許容する日数（穴埋め枠）。これを超える未投稿があるとその月の皆勤賞は不成立。
 * 特典サーバー（env FAVOR_SERVERS）所属ユーザーのみ +1 日だけ優遇する（FAVORED=4 / その他=3）。
 * しきい値は所属インスタンスごとに `perfectMonthGrace(domain)`（サーバー専用の
 * @/lib/achievements/grace）で解決し、live/backfill/カレンダーAPI のいずれも
 * 「投稿者本人の所属インスタンス」基準で判定する。
 * このモジュールはクライアントからも import されるため env は読まない（定数のみ）。
 */
export const PERFECT_MONTH_GRACE_FAVORED = 4;
/** 特典サーバー以外のインスタンス所属ユーザーの未投稿許容日数。 */
export const PERFECT_MONTH_GRACE_DEFAULT = 3;

/** 穴埋め推奨通知を送る／カレンダーで注意を促す「過ぎた未投稿日数」の上限。超えたら出さない。 */
export const MAKEUP_REMINDER_MAX_SKIPPED = 5;

/** "2026-06" → "perfect-month:2026-06" */
export function perfectMonthKey(ym: string): string {
  return `${PERFECT_MONTH_CATEGORY}:${ym}`;
}

/** その年月（month は 1 始まり）の日数。 */
export function daysInMonthOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * 日別投稿数の集まり（各日の投稿枚数）→ 集計値。
 * - distinctDays: 1枚以上投稿した日数
 * - doubleDays: 2枚以上投稿した日数（＝穴埋めに使えるストック）
 */
export function summarizeDayCounts(counts: Iterable<number>): {
  distinctDays: number;
  doubleDays: number;
} {
  let distinctDays = 0;
  let doubleDays = 0;
  for (const c of counts) {
    if (c >= 1) distinctDays++;
    if (c >= 2) doubleDays++;
  }
  return { distinctDays, doubleDays };
}

/** 日(1-31) → その日の投稿数。投稿のない日はキー無し（0扱い）でよい。 */
export type DayCounts = Record<number, number> | ReadonlyMap<number, number>;

/** DayCounts を「日→投稿数」の関数に正規化する。 */
function toCountFn(dayCounts: DayCounts): (day: number) => number {
  if (dayCounts instanceof Map) return (d) => dayCounts.get(d) ?? 0;
  const rec = dayCounts as Record<number, number>;
  return (d) => rec[d] ?? 0;
}

/** distinct（1枚以上投稿した日数）を数える。 */
function countDistinct(count: (day: number) => number, daysInMonth: number): number {
  let n = 0;
  for (let d = 1; d <= daysInMonth; d++) if (count(d) >= 1) n++;
  return n;
}

/**
 * 穴埋め割当は Image.makeupTargetDay に永続化する（donor投稿→埋める空き日）。
 * 表示（カレンダー）も判定（皆勤賞）も、この永続値だけを読む＝表示と👑が食い違わない単一ソース。
 * ここに集めるのは「割当を決める貪欲ロジック（pickMakeupHole / assignMonthMakeups）」と
 * 「永続割当から達成/進捗を導く純粋関数（isPerfectMonth / currentMonthMakeupStatus）」。
 *
 * 割当ルール（従来の computeMakeups と同一の最古優先貪欲）:
 * - ダブル投稿日 D（>=2枚）は「D より前の未割当の最古の穴(0枚の日)」を1つ埋める。1日1穴。
 * - 投稿は createdAt 単調増加で過去日には投稿できないため、投稿時の逐次割当（pickMakeupHole）は
 *   一括再計算（assignMonthMakeups）と必ず一致する。
 * - **grace 上限を割当時にも掛ける**: 既に grace 個埋まっていればそれ以上は割り当てない。
 *   （表示は元々 grace 件までなので、DBに grace 超の割当を残すと「表示上は空き日なのに
 *   その写真は穴埋めに使用中」と食い違うため。判定は missing<=grace が前提なので
 *   上限を掛けても皆勤賞の結果は不変＝超過割当は非達成月にしか発生しない。）
 */

/**
 * 新しい投稿（postDay に投稿）が埋めるべき「過去の空き日」を1つ返す（逐次貪欲・純粋）。
 * - postDay がダブル投稿日（count>=2）で、まだその日に donor 割当が無く（postDayHasDonor=false）、
 *   既に埋めた穴が grace 未満で、postDay より前に未割当の穴があれば、その最古の穴を返す。
 * - 条件を満たさなければ null（＝この投稿は穴埋めに使わない）。
 * live（投稿時）と assignMonthMakeups（一括）が共用する唯一の割当規則。
 */
export function pickMakeupHole(args: {
  dayCounts: DayCounts;
  filledHoleDays: Iterable<number>;
  postDay: number;
  postDayHasDonor: boolean;
  grace: number;
}): number | null {
  const { postDay, postDayHasDonor, grace } = args;
  const count = toCountFn(args.dayCounts);
  if (count(postDay) < 2 || postDayHasDonor) return null;
  // 既に埋めた「実際の空き日」の distinct 件数。grace に達していたら打ち止め。
  const filled = new Set<number>();
  for (const d of args.filledHoleDays) if (count(d) === 0) filled.add(d);
  if (filled.size >= grace) return null;
  for (let d = 1; d < postDay; d++) {
    if (count(d) === 0 && !filled.has(d)) return d;
  }
  return null;
}

/**
 * 月内の投稿列（createdAt 昇順）から穴埋め割当を一括算出（逐次貪欲・純粋・grace 上限つき）。
 * 返り値: donor になった投稿の id → 埋める穴の日(1-31)。live の pickMakeupHole と同一規則なので
 * 一括再計算しても投稿時の逐次割当と一致する。backfill の一括 populate と削除後の自己修復で使う。
 * donor は「その日の2枚目に投稿した写真」（＝ダブルにした投稿）になる。
 */
export function assignMonthMakeups(
  posts: ReadonlyArray<{ id: string; day: number }>,
  grace: number
): Map<string, number> {
  const dayCounts: Record<number, number> = {};
  const donorDays = new Set<number>();
  const filled: number[] = [];
  const result = new Map<string, number>();
  for (const p of posts) {
    dayCounts[p.day] = (dayCounts[p.day] ?? 0) + 1;
    const hole = pickMakeupHole({
      dayCounts,
      filledHoleDays: filled,
      postDay: p.day,
      postDayHasDonor: donorDays.has(p.day),
      grace,
    });
    if (hole != null) {
      donorDays.add(p.day);
      filled.push(hole);
      result.set(p.id, hole);
    }
  }
  return result;
}

/** filledHoleDays のうち「実際に空き日(count==0)」である distinct 件数（不正/重複を弾く）。 */
function countValidFilledHoles(
  count: (day: number) => number,
  filledHoleDays: Iterable<number>,
  daysInMonth: number,
  upToExclusive = Infinity
): number {
  const seen = new Set<number>();
  for (const d of filledHoleDays) {
    if (d >= 1 && d <= daysInMonth && d < upToExclusive && count(d) === 0) seen.add(d);
  }
  return seen.size;
}

/**
 * 皆勤賞の達成判定（純粋・永続割当ベース）。
 * missing(= daysInMonth - distinctDays) が grace 以内で、かつ全ての未投稿日が
 * 永続化された穴埋め割当（filledHoleDays）で埋まり切っている（有効な穴埋め数 >= missing）なら達成。
 * missing=0（完全皆勤）は常に成立（従来達成者と後方互換）。
 * ③ON既存ユーザーは filledHoleDays が貪欲割当と一致するため判定は従来と不変。
 * grace は投稿者の所属インスタンスで決まる（`perfectMonthGrace`）。
 */
export function isPerfectMonth(args: {
  daysInMonth: number;
  dayCounts: DayCounts;
  filledHoleDays: Iterable<number>;
  grace: number;
}): boolean {
  const { daysInMonth, grace } = args;
  const count = toCountFn(args.dayCounts);
  const distinctDays = countDistinct(count, daysInMonth);
  const missing = daysInMonth - distinctDays;
  if (missing < 0 || missing > grace) return false;
  if (missing === 0) return true;
  const fills = countValidFilledHoles(count, args.filledHoleDays, daysInMonth);
  return fills >= missing;
}

/** 当月の穴埋め進捗（カレンダーのコールアウト・通知ゲートで共用）。 */
export interface CurrentMonthMakeupStatus {
  /** 今日より前の未投稿日数。 */
  skippedSoFar: number;
  /** まだ埋まっていない（永続割当のつかない）過去の穴の数。 */
  unfilled: number;
  /** 今日すでにダブル投稿しているか（count(today) >= 2 ＝ 今日の穴埋め枠を使用済み）。 */
  todayUsedMakeup: boolean;
  /** まだ皆勤賞に手が届く範囲か（skippedSoFar <= grace）。 */
  stillAchievable: boolean;
}

/**
 * 当月の穴埋め状況を計算（純粋・永続割当ベース）。todayDayNum は JST の今日の日(1-31)。
 * unfilled は「今日より前の穴」のうち filledHoleDays（永続割当）で埋まっていない数。
 * grace は投稿者の所属インスタンスで決まる（`perfectMonthGrace`）。
 */
export function currentMonthMakeupStatus(args: {
  daysInMonth: number;
  todayDayNum: number;
  dayCounts: DayCounts;
  filledHoleDays: Iterable<number>;
  grace: number;
}): CurrentMonthMakeupStatus {
  const { daysInMonth, todayDayNum, grace } = args;
  const count = toCountFn(args.dayCounts);
  let skippedSoFar = 0;
  for (let d = 1; d < todayDayNum; d++) if (count(d) === 0) skippedSoFar++;
  const filledPast = countValidFilledHoles(count, args.filledHoleDays, daysInMonth, todayDayNum);
  return {
    skippedSoFar,
    unfilled: skippedSoFar - filledPast,
    todayUsedMakeup: count(todayDayNum) >= 2,
    stillAchievable: skippedSoFar <= grace,
  };
}

/**
 * 穴埋め推奨通知を送るべきか（純粋）。
 * - 1日以上の未投稿がある（skippedSoFar >= 1）
 * - まだ埋まっていない穴がある（unfilled > 0）
 * - 穴が多すぎない（skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED）
 * 「今日投稿した」「同月内で未送信」の条件は呼び出し側で担保する。
 */
export function shouldRemindMakeup(skippedSoFar: number, unfilled: number): boolean {
  return skippedSoFar >= 1 && unfilled > 0 && skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED;
}
