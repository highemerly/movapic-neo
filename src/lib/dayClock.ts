/**
 * 「記録日」（投稿が数えられる日）と、ユーザーごとの日付の区切りを扱う純粋モジュール。
 *
 * 1日の始まりはユーザーが 0〜4 時から選べる（2時区切り＝2:00〜翌1:59 が1日）。カレンダー・皆勤賞・
 * 連続投稿など「日」「月」が出てくる判定はすべて記録日で行い、時計の時刻で判定するもの（早起き・
 * 書き初め・シーズン等）だけが JST の時計を使う。仕様の全体は docs/features.md「日付の区切り」。
 *
 * **不変条件**
 * - 投稿の記録日は保存時に `Image.postDate` へ確定し、以後書き換えない。読む側は createdAt から
 *   日を計算し直さない（区切りの変更やここのバグで過去の記録日が動かないようにするため）。
 * - 区切りの変更は「今（＋余白）より後の境界」しか動かさない（`planBoundaryChange`）。過去の日と
 *   今日の記録日は変わらない。変更で昨日の穴を埋める抜け道もこれで塞がる。
 * - hour は 0〜23 の範囲（実際は 0〜4）。このため日 X の始まりは [X 0:00, X+1 0:00) JST に入り、
 *   時刻 t の記録日は「t の JST 日付」か「その前日」のどちらかになる。日の長さは 20〜28 時間で、
 *   記録日は時刻に対して単調（投稿順と記録日の順が逆転しない）。DB にも CHECK を置いている。
 *
 * ローカル時刻のメソッド（getDate 等）は使わない（本番は UTC・開発機は JST・ブラウザは任意の TZ）。
 * React・サーバー専用 API・env を import しないこと（クライアントからも読まれる）。
 */

/** 記録日 "YYYY-MM-DD"（JST の暦の日付として読む）。 */
export type PostDate = string & { readonly __postDate: unique symbol };

/** 区切りの履歴の1行。fromDate の記録日から hour 時区切りになる。 */
export interface BoundaryEntry {
  fromDate: PostDate;
  hour: number;
}

/** 区切りの履歴。行が無い日は 0 時区切り。並び順は問わない。 */
export type BoundarySchedule = ReadonlyArray<BoundaryEntry>;

/**
 * 選べる区切り（時）。5 以上を足すと、早起き（朝5〜7時台・時計どおり）の投稿が前の日の記録日に
 * 入るようになる。広げるときはその食い違いを検討すること。
 */
export const DAY_BOUNDARY_HOURS = [0, 1, 2, 3, 4] as const;
export const MAX_DAY_BOUNDARY_HOUR = 4;

/**
 * 区切りの変更で動かしてよい境界の、今からの最小の距離。投稿処理は履歴を読んでから保存するまでに
 * わずかな時間がかかる。その間に境界が動くと「今日」より先の日に投稿が入るため、余白を取る。
 */
export const BOUNDARY_CHANGE_MARGIN_MS = 10 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;
const POST_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 区切りで決まる1日の範囲の表示（"0:00〜23:59" / "2:00〜翌1:59"）。 */
export function dayRangeLabel(hour: number): string {
  return hour === 0 ? "0:00〜23:59" : `${hour}:00〜翌${hour - 1}:59`;
}

/**
 * 今日の区切りと予約（upcomingChanges）の説明文（設定画面・保存後のトースト）。
 * 予約は「今日から効いている」と誤解されないよう、必ず日付つきで出す。
 */
export function describeBoundarySchedule(
  todayHour: number,
  upcoming: ReadonlyArray<{ fromDate: string; hour: number }>
): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const today = `（今日は${todayHour}時区切りのままです）`;
  // 予約を取り消して今の区切りに戻したとき。
  if (upcoming.length === 0) return `${todayHour}時区切りのままです`;
  if (upcoming.length === 1) {
    return `${md(upcoming[0].fromDate)}から${upcoming[0].hour}時区切りになります${today}`;
  }
  const [first, second] = upcoming;
  return `${md(first.fromDate)}は${first.hour}時区切り、${md(second.fromDate)}から${second.hour}時区切りになります${today}`;
}

/** 区切りとして受け付ける値か（API の入力検証）。 */
export function isValidBoundaryHour(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_DAY_BOUNDARY_HOUR;
}

/** 実在する "YYYY-MM-DD" か。 */
export function isPostDate(s: unknown): s is PostDate {
  if (typeof s !== "string") return false;
  const m = POST_DATE_RE.exec(s);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === s;
}

/** 文字列を記録日として扱う（不正なら例外）。DB・API 境界で使う。 */
export function asPostDate(s: string): PostDate {
  if (!isPostDate(s)) throw new Error(`Invalid post date: ${s}`);
  return s;
}

/** 記録日の UTC 0:00 のミリ秒（日付の加減算用の内部表現。時刻としての意味は無い）。 */
function utcMsOf(d: PostDate): number {
  return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
}

function fromUtcMs(ms: number): PostDate {
  return new Date(ms).toISOString().slice(0, 10) as PostDate;
}

/** 時刻 t の JST の暦日（区切りを考えない時計の日付）。 */
export function jstCalendarDateOf(t: Date): PostDate {
  return fromUtcMs(t.getTime() + JST_OFFSET_MS);
}

/** 記録日を n 日ずらす。 */
export function addDays(d: PostDate, n: number): PostDate {
  return fromUtcMs(utcMsOf(d) + n * DAY_MS);
}

/** b − a の日数。 */
export function daysBetween(a: PostDate, b: PostDate): number {
  return Math.round((utcMsOf(b) - utcMsOf(a)) / DAY_MS);
}

/** 記録日の年月 "YYYY-MM"。 */
export function ymOf(d: PostDate): string {
  return d.slice(0, 7);
}

/** 記録日の日(1-31)。 */
export function dayOfMonth(d: PostDate): number {
  return Number(d.slice(8, 10));
}

/** "YYYY-MM" の1日。 */
export function firstDayOfYm(ym: string): PostDate {
  return asPostDate(`${ym}-01`);
}

/** "YYYY-MM" の末日。 */
export function lastDayOfYm(ym: string): PostDate {
  // 翌月の0日＝その月の末日（Date.UTC の month は 0 始まりなので、1 始まりの m がそのまま翌月になる）。
  return fromUtcMs(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0));
}

/** "YYYY-MM" の d 日の記録日。 */
export function postDateOfYmDay(ym: string, day: number): PostDate {
  return asPostDate(`${ym}-${String(day).padStart(2, "0")}`);
}

/** 全日同じ区切りの履歴。 */
export function uniformSchedule(hour: number): BoundarySchedule {
  return [{ fromDate: "0001-01-01" as PostDate, hour }];
}

/**
 * 時計どおりの暦日（全日 0 時区切り＝区切りを設定していない人と同じ）。区切りと無関係に JST の暦で
 * 決めるもの（登録日・シーズンの境界など）に使う。
 */
export const JST_CLOCK: BoundarySchedule = [];

/**
 * 全員共通の「いちばん遅い時計」（全日 4 時区切り）。誰の X 日も X 4:00 JST までには始まっている
 * ので、これで「X 日になった」と判定すれば全員が X 日にいる。月次の一括処理のゲートに使う
 * （ユーザーごとの履歴を読まずに、全員の月の切り替わり・締切の後に動かせる）。
 */
export const LATEST_CLOCK: BoundarySchedule = uniformSchedule(MAX_DAY_BOUNDARY_HOUR);

/** 記録日 d の区切り（時）。fromDate <= d の最新の行。無ければ 0。 */
export function hourOn(s: BoundarySchedule, d: PostDate): number {
  let best: BoundaryEntry | null = null;
  for (const e of s) {
    if (e.fromDate <= d && (best == null || e.fromDate > best.fromDate)) best = e;
  }
  return best?.hour ?? 0;
}

/** 記録日 d の始まりの時刻（d 0:00 JST + その日の区切り）。 */
export function dayStart(s: BoundarySchedule, d: PostDate): Date {
  return new Date(utcMsOf(d) - JST_OFFSET_MS + hourOn(s, d) * HOUR_MS);
}

/**
 * 時刻 t の記録日。日の始まりは [X 0:00, X+1 0:00) JST に入るので、候補は t の JST 暦日か前日だけ。
 */
export function postDateOf(s: BoundarySchedule, t: Date): PostDate {
  const jst = jstCalendarDateOf(t);
  return t.getTime() < dayStart(s, jst).getTime() ? addDays(jst, -1) : jst;
}

/** 今日の記録日（`postDateOf` の別名。「今」を扱う箇所で意図を明示するため）。 */
export function todayOf(s: BoundarySchedule, now: Date): PostDate {
  return postDateOf(s, now);
}

/** 区切りの変更の計画。deleteFrom 以降の行を消し、insert があれば足す。 */
export interface BoundaryChangePlan {
  deleteFrom: PostDate;
  insert: BoundaryEntry | null;
}

/**
 * 時刻 now に区切りを hour へ変えるときの計画（過去と今日を動かさない）。
 *
 * 適用開始日 E = max(記録日(now+余白, 今の履歴), 記録日(now+余白, 全日 hour)) + 1日。
 * - 前者: 旧い境界 start(E) が now+余白 より後＝まだ来ていない境界だけを動かす。
 * - 後者: 新しい境界 E 0:00 + hour も now+余白 より後に来る。
 * どちらかが過ぎていると「過ぎた境界を動かす」＝保存済みの投稿や今日の記録日が変わってしまう。
 * 例: 2時区切りの人が 11/9 1:00（まだ 11/8）に 0 時区切りへ変えると、11/9 0:00 は過ぎているので
 * E=11/10（11/9 は 2:00〜翌0:00 の22時間）。0 時区切りの人が 1:00 に 4 時区切りへ変えて昨日の分に
 * する、という抜け道も E が明後日になるので成立しない。
 *
 * 予約の上書き・取り消しも同じ式で扱う。そのため今日より後の行は最大2つになりうる。
 */
export function planBoundaryChange(
  s: BoundarySchedule,
  hour: number,
  now: Date
): BoundaryChangePlan {
  const probe = new Date(now.getTime() + BOUNDARY_CHANGE_MARGIN_MS);
  const current = postDateOf(s, probe);
  const asIfNew = postDateOf(uniformSchedule(hour), probe);
  const fromDate = addDays(current > asIfNew ? current : asIfNew, 1);
  const kept = s.filter((e) => e.fromDate < fromDate);
  return {
    deleteFrom: fromDate,
    insert: hourOn(kept, fromDate) === hour ? null : { fromDate, hour },
  };
}

/** 計画を履歴に当てた結果（DB に書くのと同じ形を、画面やテストで組むため）。 */
export function applyBoundaryChange(
  s: BoundarySchedule,
  plan: BoundaryChangePlan
): BoundaryEntry[] {
  const kept = s.filter((e) => e.fromDate < plan.deleteFrom);
  return sortSchedule(plan.insert ? [...kept, plan.insert] : kept);
}

/** 今日より後に効く行（予約）。最大2つ。日付順。 */
export function upcomingChanges(s: BoundarySchedule, now: Date): BoundaryEntry[] {
  const today = todayOf(s, now);
  return sortSchedule(s.filter((e) => e.fromDate > today));
}

function sortSchedule(s: BoundarySchedule): BoundaryEntry[] {
  return [...s].sort((a, b) => (a.fromDate < b.fromDate ? -1 : a.fromDate > b.fromDate ? 1 : 0));
}
