/**
 * ミュート期間の定義（純粋ロジック・prisma 非依存）。
 *
 * クライアント（期間選択UI）とサーバー（API・ヘルパー）の両方から読むため、
 * prisma を import する src/lib/mutes.ts とは分けてここに置く（クライアントバンドルに
 * prisma を巻き込まないため）。
 */

/** ミュート期間の選択肢。"indefinite" は無期（expiresAt=null）。 */
export const MUTE_DURATIONS = ["1d", "7d", "30d", "90d", "indefinite"] as const;
export type MuteDuration = (typeof MUTE_DURATIONS)[number];

/** 期間の表示ラベル（UI 用）。 */
export const MUTE_DURATION_LABELS: Record<MuteDuration, string> = {
  "1d": "1日",
  "7d": "7日",
  "30d": "30日",
  "90d": "90日",
  indefinite: "無期限",
};

const DURATION_DAYS: Record<Exclude<MuteDuration, "indefinite">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function isMuteDuration(value: unknown): value is MuteDuration {
  return typeof value === "string" && (MUTE_DURATIONS as readonly string[]).includes(value);
}

/**
 * 期間指定を expiresAt（絶対時刻 or null=無期）に変換する。
 * 基準時刻を引数で受け取れるようにし、テストと呼び出し側で now を固定できる。
 */
export function durationToExpiresAt(duration: MuteDuration, now: Date = new Date()): Date | null {
  if (duration === "indefinite") return null;
  return new Date(now.getTime() + DURATION_DAYS[duration] * 24 * 60 * 60 * 1000);
}
