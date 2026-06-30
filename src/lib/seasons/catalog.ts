/**
 * シーズン（期間限定）レジストリ。
 *
 * シーズンは position/color/size/font/arrangement とは独立した特殊モードで、選択すると
 * それら通常オプションを完全に上書きし、プリセットの装飾で生成する（縦書き短冊など）。
 *
 * このファイルは「純粋な静的config」。worker-front（期間検証・ラベル表示）と
 * compute（実際の描画）の両方から import される。React / DB / 秘密情報に依存しないこと。
 *
 * 重要な不変条件:
 * - `key` は永続。実績キー `season:<key>` の一部になるためリネーム・使い回し禁止。
 * - 期間チェックは生成・投稿のみ（worker-front 側）。閲覧・削除は常に可能。
 *   期間が過ぎれば二度と生成できない＝「同じオプションは二度と使えない」を期間で担保。
 */

import type { Position, Color, Size, FontFamily } from "@/types";

/** compute のレンダラ分岐キー（装飾の種類） */
export type SeasonDecoration = "tanzaku";

export interface SeasonDef {
  /** 永続キー。例: "tanabata-2026"（実績キーになるためリネーム禁止） */
  key: string;
  /** 表示名（実績名・UI・詳細ページに出る）。例: "七夕" */
  label: string;
  /** 開始日時（JST ISO・この瞬間以降が有効） */
  start: string;
  /** 終了日時（JST ISO・この瞬間以前が有効） */
  end: string;
  /**
   * 通常パイプライン互換のためのプリセット。compute がこの値で描画し、DBのスタイル列にも
   * この実値を保存する（タイル表示のフォーカス位置・拡大率を実描画に一致させるため）。
   * 実績は別途 season:null フィルタで隔離するので、列に実値が入っても既存実績は汚染されない。
   *
   * textColorHex / strokeColorHex は「描画専用」の上書き色（hex/rgba）。Color enum に無い色
   * （例: 黒）を使いたいシーズン用。未指定なら color から通常どおり決定する。
   * strokeColorHex を透明にすると縁取りなし＝マジックで書いたような見た目になる。
   */
  preset: {
    position: Position;
    color: Color;
    size: Size;
    font: FontFamily;
    textColorHex?: string;
    strokeColorHex?: string;
  };
  /** 装飾の種類（compute の seasons レンダラが分岐に使う） */
  decoration: SeasonDecoration;
  /** UI/詳細ページ向けの一言説明 */
  description: string;
}

/**
 * シーズン定義一覧。新シーズン追加はここに1要素足すだけ（デプロイが必要）。
 * 同時にアクティブになるシーズンは1つを前提（期間を重ねない）。
 */
export const SEASONS: SeasonDef[] = [
  {
    key: "tanabata-2026",
    label: "七夕",
    start: "2026-07-01T00:00:00+09:00",
    end: "2026-07-12T23:59:59+09:00",
    preset: {
      position: "right", // 縦書き（右）
      color: "white", // DB列用（描画はマジック風の黒文字＝下の textColorHex で上書き）
      size: "medium",
      font: "hui-font", // ふい字
      textColorHex: "#1a1a1a", // 短冊にマジックで書いた黒文字
      strokeColorHex: "rgba(0,0,0,0)", // 縁取りなし
    },
    decoration: "tanzaku", // 短冊風の背景
    description: "縦書き・短冊風の七夕限定デコレーション",
  },
];

const byKey = new Map<string, SeasonDef>(SEASONS.map((s) => [s.key, s]));

/**
 * デバッグ用: `DEBUG_FORCE_SEASON=<seasonKey>` を設定すると、期間に関わらずその
 * シーズンを常時アクティブ扱いにする（create のトグル表示・生成/投稿の期間チェック・
 * メール/Bot のコマンド解決すべてに効く）。サーバー側のみ参照（本番では未設定＝無効）。
 */
function forcedSeason(): SeasonDef | null {
  const key = process.env.DEBUG_FORCE_SEASON;
  return key ? getSeasonByKey(key) ?? null : null;
}

/** キーからシーズン定義を引く（期間終了後も引ける＝過去投稿の表示用）。 */
export function getSeasonByKey(key: string | null | undefined): SeasonDef | undefined {
  if (!key) return undefined;
  return byKey.get(key);
}

/** 表示用ラベル。未知キーはキーをそのまま返す。 */
export function seasonLabel(key: string | null | undefined): string {
  return getSeasonByKey(key)?.label ?? (key ?? "");
}

/** 期間の表示用ラベル（例 "7/1〜7/10"）。start/end の JST 日付部分から組む。 */
export function seasonPeriodLabel(def: SeasonDef): string {
  const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  return `${md(def.start)}〜${md(def.end)}`;
}

/** 指定時刻に有効なシーズンを返す（無ければ null）。 */
export function getActiveSeason(now: Date): SeasonDef | null {
  const forced = forcedSeason();
  if (forced) return forced;
  const t = now.getTime();
  for (const s of SEASONS) {
    if (t >= Date.parse(s.start) && t <= Date.parse(s.end)) return s;
  }
  return null;
}

/** 指定キーのシーズンがその時刻に有効か（生成・投稿の可否判定）。 */
export function isSeasonActiveNow(key: string, now: Date): boolean {
  const forced = forcedSeason();
  if (forced && forced.key === key) return true;
  const s = getSeasonByKey(key);
  if (!s) return false;
  const t = now.getTime();
  return t >= Date.parse(s.start) && t <= Date.parse(s.end);
}
