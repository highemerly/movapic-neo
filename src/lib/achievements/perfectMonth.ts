/**
 * 皆勤賞ロジックの単一ソース（しきい値・判定式・進捗・穴埋め通知ゲートを集約）。
 *
 * 「皆勤賞」は『未投稿を grace 日まで許容し、その分を "後日" に 2枚以上投稿（＝ダブル投稿）して
 * 穴埋めできる』制度。穴埋めは「忘れた過去日」を「それより後の日のダブル投稿」で埋めるもので、
 * ダブル投稿日 D は D より前の未投稿日のみ埋められる（将来日は埋められない）。1日のダブルは
 * 1日分のみ埋める。判定の中核を1箇所に集め、live(stats/engine) / backfill / カレンダーAPI /
 * 穴埋め通知 の4経路がすべてここを呼ぶ。
 *
 * donor（穴を埋める写真）は締切（翌月10日）までなら**翌月の投稿でもよい**（@/lib/makeup/donor）。
 * ここの関数はどれも「対象月の日(1-31)」しか受け取らないので、donor がどの月にいるかは関係しない
 * ＝ 呼び出し側が filledHoleDays を組むときに月を解決する。
 *
 * **grace＝「その月に穴埋めできる上限日数」**。ここでは出所を問わない。2026-09 以前の月は
 * 所属インスタンスで決まる固定値（3/4）、2026-10 以降は穴埋めポイントの付与合計
 * （@/lib/makeup/points・台帳は月内で単調非減少・月末凍結）。解決は呼び出し側が
 * `resolveMakeupCap`（@/lib/makeup/ledger）で行って渡す。意味を変えずに出所だけを差し替えたので、
 * 割当（pickMakeupHole）・判定（isPerfectMonth）の式は制度変更の前後で同一。
 *
 * catalog.ts と同じく「サーバー/クライアント両方から import されうる」ため、
 * React・サーバー専用 API を import しないこと（型・純粋関数のみ）。
 */

/** 皆勤賞の系列キー（DBの category 列）。動的キーは "perfect-month:YYYY-MM"。 */
export const PERFECT_MONTH_CATEGORY = "perfect-month";

/**
 * 2026-09 以前の月の、未投稿として許容する日数（穴埋め枠）。2026-10 以降は穴埋めポイントに置き換わった。
 * これを超える未投稿があるとその月の皆勤賞は不成立。
 * 特典サーバー（env FAVOR_SERVERS）所属ユーザーのみ +1 日だけ優遇する（FAVORED=4 / その他=3）。
 * しきい値は所属インスタンスごとに `perfectMonthGrace(domain)`（サーバー専用の
 * @/lib/achievements/grace）で解決し、live/backfill/カレンダーAPI のいずれも
 * 「投稿者本人の所属インスタンス」基準で判定する。
 * このモジュールはクライアントからも import されるため env は読まない（定数のみ）。
 */
export const PERFECT_MONTH_GRACE_FAVORED = 4;
/** 特典サーバー以外のインスタンス所属ユーザーの未投稿許容日数。 */
export const PERFECT_MONTH_GRACE_DEFAULT = 3;

/**
 * 2026-09 以前の月の穴埋め推奨通知（makeup-reminder）を送る「過ぎた未投稿日数」の上限。超えたら出さない。
 * ポイント制の月では使わない: 9日登録の新規ユーザー（8pt・穴8日）が最も救済したい層なのに、
 * この上限だと通知が一切出なくなる。ポイント制では残高と達成可能性（canPromptMakeup）が役目を引き継ぐ。
 */
// TODO(cleanup-2026-10): docs/cleanup-2026-10.md 参照（shouldRemindMakeup と一緒に削除）
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
 * 割当ルール（従来の computeMakeups と同一の最古優先貪欲。2026-09 以前の月の自動割当専用なので
 * 月またぎ donor は扱わない＝ポイント制の月は手動割当のみ）:
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
  /** 今月あと何日ぶん埋められるか（grace − 埋めた数）。0 なら今は割り当てられない。 */
  remaining: number;
  /** 今日の投稿数。1 なら「もう1枚で穴埋めできる」、2以上なら donor 候補がある。 */
  todayPosts: number;
  /**
   * 今日の投稿のどれかが既に穴を埋めているか（1日1donor なので、true なら今日はもう埋められない）。
   *
   * pitfall: 以前は `count(today) >= 2` で代用していた。自動穴埋めでは「2枚投稿した瞬間に
   * donor が割り当たる」ので同値だったが、手動専用になると「2枚投稿したがまだ割り当てていない」が
   * 常態になり、コールアウトが即「明日2枚投稿しよう」になって「今すぐ穴埋めしよう」が永久に出なかった。
   * 実際の割当（donor の有無）を見れば、自動穴埋めの月でも同じ結果になる。
   */
  todayHasDonor: boolean;
  /**
   * まだ皆勤賞に手が届く範囲か（skippedSoFar <= potentialGrace）。
   * 「今使える枠(grace)」ではなく「月内にまだ付与されうる分も含めた上限」で判定する。
   * grace で判定すると、ポイント制の月初（cap=0）に1日休んだ瞬間に達成不可となり、
   * 11日に+1pt が来るまでコールアウトも通知も消えてしまうため。
   */
  stillAchievable: boolean;
}

/**
 * 当月の穴埋め状況を計算（純粋・永続割当ベース）。todayDayNum は JST の今日の日(1-31)。
 * unfilled は「今日より前の穴」のうち filledHoleDays（永続割当）で埋まっていない数。
 */
export function currentMonthMakeupStatus(args: {
  daysInMonth: number;
  todayDayNum: number;
  dayCounts: DayCounts;
  filledHoleDays: Iterable<number>;
  /** 今日の投稿に donor（makeupTargetDay が付いた画像）がいるか。 */
  todayHasDonor: boolean;
  /** その月に今埋められる上限（cap）。 */
  grace: number;
  /** その月にまだ付与されうる分も含めた上限（potentialCapOf）。従来ルールの月は grace と同じ値を渡す。 */
  potentialGrace: number;
}): CurrentMonthMakeupStatus {
  const { daysInMonth, todayDayNum, grace, potentialGrace } = args;
  const count = toCountFn(args.dayCounts);
  let skippedSoFar = 0;
  for (let d = 1; d < todayDayNum; d++) if (count(d) === 0) skippedSoFar++;
  const filledPast = countValidFilledHoles(count, args.filledHoleDays, daysInMonth, todayDayNum);
  return {
    skippedSoFar,
    unfilled: skippedSoFar - filledPast,
    remaining: Math.max(0, grace - filledPast),
    todayPosts: count(todayDayNum),
    todayHasDonor: args.todayHasDonor,
    stillAchievable: skippedSoFar <= potentialGrace,
  };
}

/**
 * 今すぐ手動で割り当てられる「donor 候補の日 × 未充填の穴」の組が1つでもあるか（純粋）。
 * donor 候補 = 2枚以上投稿していて、まだその日に donor がいない日（1日1donor）。
 * 穴 = donor 候補の日より前の、投稿0枚でまだ埋まっていない日（穴は donor より前しか埋められない）。
 *
 * 付与の瞬間の「穴埋めできるようになりました」通知の判定に使う。今日の投稿に限らないのは、
 * 例えば8日にダブル投稿・3日が穴の状態で11日に+1pt が来たら、その場で埋められるため。
 */
export function hasAssignableMakeup(args: {
  daysInMonth: number;
  dayCounts: DayCounts;
  filledHoleDays: Iterable<number>;
  /** donor 割当（makeupTargetDay が付いた画像）がいる日。 */
  donorDays: Iterable<number>;
}): boolean {
  const { daysInMonth } = args;
  const count = toCountFn(args.dayCounts);
  const filled = new Set(args.filledHoleDays);
  const donors = new Set(args.donorDays);
  // 古い日から見て「最初に現れた未充填の穴」より後ろに donor 候補があれば組が作れる。
  let firstOpenHole = Infinity;
  for (let d = 1; d <= daysInMonth; d++) {
    if (count(d) === 0 && !filled.has(d) && firstOpenHole === Infinity) firstOpenHole = d;
    if (count(d) >= 2 && !donors.has(d) && d > firstOpenHole) return true;
  }
  return false;
}

/**
 * 穴埋めを促してよい状態か（ポイント制の促し通知・カレンダーのコールアウトで共用・純粋）。
 * - まだ埋まっていない穴がある
 * - 今の残高で1つ以上埋められる（残高0で促しても押せるボタンが無い）
 * - その月がまだ達成可能（穴が多すぎて皆勤不可能な人を毎日つつかない）
 * 締切（isMakeupEditable）と「今日の枚数」による出し分けは呼び出し側で行う。
 */
export function canPromptMakeup(status: CurrentMonthMakeupStatus): boolean {
  return status.unfilled > 0 && status.remaining >= 1 && status.stillAchievable;
}

/**
 * 進捗表示用の「押さえた日数」＝ 投稿した日数 + 穴埋め済みの空き日数（純粋）。
 * カレンダーでは穴埋め済みの日も donor 画像で埋まって見えるため、合算しないと
 * 「毎日埋まっているのに 29/31日投稿」と表示が食い違う。
 */
export function coveredDays(distinctDays: number, status: CurrentMonthMakeupStatus): number {
  return distinctDays + Math.max(0, status.skippedSoFar - status.unfilled);
}

/**
 * 2026-09 以前の月の穴埋め推奨通知（makeup-reminder）を送るべきか（純粋）。
 * ポイント制の月は canPromptMakeup を使う。投稿は必ず当月に入るので、2026-10-01 以降は呼ばれない。
 * - 1日以上の未投稿がある（skippedSoFar >= 1）
 * - まだ埋まっていない穴がある（unfilled > 0）
 * - 穴が多すぎない（skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED）
 * 「今日投稿した」「同月内で未送信」の条件は呼び出し側で担保する。
 */
// TODO(cleanup-2026-10): docs/cleanup-2026-10.md 参照
export function shouldRemindMakeup(skippedSoFar: number, unfilled: number): boolean {
  return skippedSoFar >= 1 && unfilled > 0 && skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED;
}
