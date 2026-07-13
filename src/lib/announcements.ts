/**
 * 運営からのお知らせ（全ユーザー共通）の共通ロジック（ピュア）。
 *
 * 設計:
 * - データは DB（Announcement テーブル）が正。Admin UI から作成・編集する。
 * - めったに更新されないので、取得は unstable_cache（タグ ANNOUNCEMENTS_TAG）でキャッシュし
 *   毎リクエストのDBアクセスを避ける。Admin での書き込み時にのみ revalidateTag で破棄する
 *   （= 編集は即時反映。blockCrawlers / robots-blocklist と同じ確立パターン）。
 * - 時刻依存の可視性（公開予定 publishAt / バナー掲載 pinnedUntil）は「全件をキャッシュし、
 *   取得後に now でフィルタ」する。これによりキャッシュを保ちつつ、予約公開やバナーの自動消灯は
 *   常に最新時刻で判定できる（時刻をキャッシュに焼き付けない）。
 *
 * このモジュールは prisma/next を import しないピュア層（クライアントからも安全に import 可）。
 * DB 取得・キャッシュは announcements.server.ts に分離している。
 */

/** お知らせ取得キャッシュのタグ。作成/編集/削除時にこのタグを revalidateTag する。 */
export const ANNOUNCEMENTS_TAG = "announcements";

/**
 * 重要度。severity は warning > info > low。
 * - warning / info: 公開後 pinnedUntil までページ上部バナーに常時表示。
 * - low: バナーには一切出さない（一覧・詳細のみ）。
 */
export type AnnouncementType = "warning" | "info" | "low";

export const ANNOUNCEMENT_TYPES: AnnouncementType[] = ["warning", "info", "low"];

const TYPE_LABELS: Record<AnnouncementType, string> = {
  warning: "重要",
  info: "お知らせ",
  low: "軽微",
};

/** 表示用ラベル（Admin フォーム等）。 */
export function announcementTypeLabel(type: AnnouncementType): string {
  return TYPE_LABELS[type];
}

/** 未知/レガシー値を既知の union に丸める（DB の type は文字列カラムのため）。 */
export function normalizeAnnouncementType(type: string): AnnouncementType {
  return (ANNOUNCEMENT_TYPES as string[]).includes(type)
    ? (type as AnnouncementType)
    : "info";
}

/**
 * UI/キャッシュで扱うシリアライズ可能な形。unstable_cache は結果を JSON 化するため、
 * DateTime は ISO 文字列で保持する（Prisma の Date をそのまま返すとキャッシュ経由で
 * 文字列化され型と実体がズレるのを防ぐ）。
 */
export type AnnouncementRecord = {
  id: number;
  type: AnnouncementType;
  message: string;
  detail: string | null;
  publishAt: string; // ISO
  pinnedUntil: string | null; // ISO
  createdAt: string; // ISO
};

/** Prisma 行（Date 型フィールド）を UI/キャッシュ用の ISO 文字列レコードへ正規化する。 */
export function toAnnouncementRecord(row: {
  id: number;
  type: string;
  message: string;
  detail: string | null;
  publishAt: Date;
  pinnedUntil: Date | null;
  createdAt: Date;
}): AnnouncementRecord {
  return {
    id: row.id,
    type: normalizeAnnouncementType(row.type),
    message: row.message,
    detail: row.detail,
    publishAt: row.publishAt.toISOString(),
    pinnedUntil: row.pinnedUntil ? row.pinnedUntil.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── 可視性ロジック（ピュア関数。テスト対象） ────────────────────────────

/** now（epoch ms）時点で公開済みか（予約公開の判定）。 */
export function isPublished(a: AnnouncementRecord, now: number): boolean {
  return new Date(a.publishAt).getTime() <= now;
}

/** 上部バナーに出しうる重要度か（low は常に出さない）。 */
export function isBannerEligible(a: AnnouncementRecord): boolean {
  return a.type !== "low";
}

/** now 時点でバナーに常時表示すべきか（公開済み・banner対象・pinnedUntil 未到来）。 */
export function isPinnedNow(a: AnnouncementRecord, now: number): boolean {
  return isBannerEligible(a) && isPublished(a, now) && now < bannerEndsAt(a);
}

/** バナー掲載終了の既定日数（pinnedUntil 未指定時に公開から自動で消えるまで）。 */
export const DEFAULT_BANNER_DAYS = 7;

/**
 * バナー掲載を終了する時刻（epoch ms）。
 * pinnedUntil 指定時はその日時、未指定（null）時は「公開日時 + DEFAULT_BANNER_DAYS 日」。
 */
export function bannerEndsAt(a: AnnouncementRecord): number {
  if (a.pinnedUntil) return new Date(a.pinnedUntil).getTime();
  return (
    new Date(a.publishAt).getTime() +
    DEFAULT_BANNER_DAYS * 24 * 60 * 60 * 1000
  );
}

/** 新しい順（公開日時降順、同時刻は id 降順）。 */
function byNewest(a: AnnouncementRecord, b: AnnouncementRecord): number {
  return b.publishAt.localeCompare(a.publishAt) || b.id - a.id;
}

/** 一覧ページ用: 公開済みを新しい順に。 */
export function listForAnnouncementsPage(
  all: AnnouncementRecord[],
  now: number
): AnnouncementRecord[] {
  return all.filter((a) => isPublished(a, now)).sort(byNewest);
}

/** 上部バナー用: 公開済み・banner対象・pinnedUntil 未到来のものを id 降順に。 */
export function bannerAnnouncements(
  all: AnnouncementRecord[],
  now: number
): AnnouncementRecord[] {
  return all.filter((a) => isPinnedNow(a, now)).sort((a, b) => b.id - a.id);
}

// ── 既読 Cookie（バナーの「すべて既読」管理） ─────────────────────────────
//
// 予約公開により「id順 ≠ 公開順」になりうるため、単一の最大id（高水位マーク）だと
// 先に作った予約お知らせ（小さいid）が、後から既読にした通常お知らせ（大きいid）に
// 飛び越されて出なくなる。これを防ぐため既読は「idの集合」で持つ。集合には常に
// 「現在バナー掲載中のidだけ」を保存（呼び出し側で置換）するため、pinnedUntil の失効に
// つれ自然に縮み、Cookie は同時掲載件数（通常数件）に張り付き肥大化しない。
//
// Cookie 形式: "2:5-6-9"（バージョン2＝ハイフン区切り）。旧形式（単一整数 "6"）は
// 「その値以下は既読」の高水位マークとして後方互換で解釈する。

export type AnnouncementReadState = {
  legacyMax: number;
  readIds: Set<number>;
};

/** 既読 Cookie 文字列を解釈する（新形式＝id集合／旧形式＝高水位マーク）。 */
export function parseAnnouncementReadState(
  raw: string | null | undefined
): AnnouncementReadState {
  if (!raw) return { legacyMax: 0, readIds: new Set() };
  if (raw.startsWith("2:")) {
    const readIds = new Set(
      raw
        .slice(2)
        .split("-")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n))
    );
    return { legacyMax: 0, readIds };
  }
  const n = parseInt(raw, 10);
  return { legacyMax: Number.isInteger(n) ? n : 0, readIds: new Set() };
}

/** 指定 id が既読か。 */
export function isAnnouncementRead(
  id: number,
  state: AnnouncementReadState
): boolean {
  return id <= state.legacyMax || state.readIds.has(id);
}

/** 既読 id 集合を Cookie 文字列（"2:1-2-3"）に直列化する。 */
export function serializeAnnouncementReadIds(ids: number[]): string {
  const uniq = [...new Set(ids)]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
  return `2:${uniq.join("-")}`;
}

/** バナーに出す未読お知らせを、既読 Cookie で絞り込む。 */
export function unreadBannerAnnouncements(
  active: AnnouncementRecord[],
  rawCookie: string | null | undefined
): AnnouncementRecord[] {
  const state = parseAnnouncementReadState(rawCookie);
  return active.filter((a) => !isAnnouncementRead(a.id, state));
}

// ── 表示用フォーマット ────────────────────────────────────────────────

/** ISO 文字列を JST で表示（既定 "M/D"、withYear で "YYYY/M/D"）。 */
export function formatAnnouncementDate(
  iso: string,
  opts?: { withYear?: boolean }
): string {
  // streak.ts と同じ +9h シフト idiom で JST の年月日を取り出す。
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return opts?.withYear ? `${y}/${m}/${d}` : `${m}/${d}`;
}
