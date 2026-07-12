/**
 * メンション内容のパーサー
 * HTMLからコマンドとテキストを抽出
 */

import {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  POSITION_LABELS,
  COLOR_LABELS,
  SIZE_LABELS,
  FONT_LABELS,
  ARRANGEMENT_LABELS,
} from "@/types";
import {
  POSITION_MAP,
  COLOR_MAP,
  SIZE_MAP,
  FONT_MAP,
  ARRANGEMENT_MAP,
  VISIBILITY_MAP,
  decodeHtmlEntities,
} from "@/lib/options/maps";
import { getActiveSeason, seasonLabel } from "@/lib/seasons/catalog";

// コマンドで指定可能なvisibility（public/unlistedのみ）
export type CommandVisibility = "public" | "unlisted";

// シーズン（期間限定）を要求するコマンドキーワード。受信時刻でアクティブなシーズンに解決する。
const SEASON_KEYWORD = "シーズン";

export interface ParsedMentionOptions {
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  arrangement: Arrangement;
  /** シーズン（期間限定）キー。「シーズン」コマンドで受信時刻のアクティブなシーズンに解決。null=通常 */
  season: string | null;
  /** 「シーズン」コマンドが指定されたか（期間外＝season=null のとき processor がエラー通知する） */
  seasonRequested: boolean;
  debug: boolean;
  keep: boolean;
  visibility?: CommandVisibility; // コマンドで指定された場合のみ設定
}

export interface ParsedMention {
  text: string;
  options: ParsedMentionOptions;
}

/**
 * ユーザーのデフォルト設定（DBから取得した値）
 */
export interface UserDefaults {
  position?: string | null;
  font?: string | null;
  color?: string | null;
  size?: string | null;
  arrangement?: string | null;
}

// オプションマップ（POSITION/COLOR/SIZE/FONT/ARRANGEMENT/VISIBILITY）と
// decodeHtmlEntities は @/lib/options/maps から import（email parser と共通）。

const FALLBACK_OPTIONS: ParsedMentionOptions = {
  position: "top",
  font: "hui-font",
  color: "white",
  size: "medium",
  arrangement: "none",
  season: null,
  seasonRequested: false,
  debug: false,
  keep: false,
};

/**
 * ユーザーのデフォルト設定とフォールバック値からデフォルトオプションを構築
 */
function buildDefaultOptions(userDefaults?: UserDefaults): ParsedMentionOptions {
  return {
    position: (userDefaults?.position as Position) || FALLBACK_OPTIONS.position,
    font: (userDefaults?.font as FontFamily) || FALLBACK_OPTIONS.font,
    color: (userDefaults?.color as Color) || FALLBACK_OPTIONS.color,
    size: (userDefaults?.size as Size) || FALLBACK_OPTIONS.size,
    arrangement: (userDefaults?.arrangement as Arrangement) || FALLBACK_OPTIONS.arrangement,
    // シーズンはユーザー設定に持たせない（一過性オプション）。コマンドでのみ有効化。
    season: null,
    seasonRequested: false,
    debug: FALLBACK_OPTIONS.debug,
    keep: FALLBACK_OPTIONS.keep,
  };
}

/**
 * HTMLタグを除去
 */
function stripHtmlTags(html: string): string {
  // <br>を改行に変換
  let text = html.replace(/<br\s*\/?>/gi, "\n");
  // </p>を改行に変換
  text = text.replace(/<\/p>/gi, "\n");
  // その他のタグを除去
  text = text.replace(/<[^>]+>/g, "");
  // HTMLエンティティをデコード
  text = decodeHtmlEntities(text);
  return text;
}

/**
 * Botへのメンション部分を除去
 * @param text テキスト
 * @param botAcct Botのアカウント名（@なし）
 */
function removeBotMention(text: string, botAcct: string): string {
  // @pic や @pic@handon.club などを除去
  const mentionPattern = new RegExp(`@${botAcct}(@[\\w.-]+)?\\s*`, "gi");
  return text.replace(mentionPattern, "").trim();
}

/**
 * コマンド部分をパース
 */
function parseCommandTokens(commandString: string): Partial<ParsedMentionOptions> {
  const options: Partial<ParsedMentionOptions> = {};
  const tokens = commandString.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    if (lowerToken === "debug") {
      options.debug = true;
    } else if (lowerToken === "keep") {
      options.keep = true;
    } else if (VISIBILITY_MAP[lowerToken]) {
      options.visibility = VISIBILITY_MAP[lowerToken];
    } else if (POSITION_MAP[token]) {
      options.position = POSITION_MAP[token];
    } else if (COLOR_MAP[token]) {
      options.color = COLOR_MAP[token];
    } else if (SIZE_MAP[token]) {
      options.size = SIZE_MAP[token];
    } else if (FONT_MAP[token]) {
      options.font = FONT_MAP[token];
    } else if (ARRANGEMENT_MAP[token]) {
      options.arrangement = ARRANGEMENT_MAP[token];
    } else if (token === SEASON_KEYWORD) {
      // シーズン（期間限定）: 受信時刻でアクティブなシーズンに解決。
      // 期間外なら season=null のまま（processor がエラー通知する）。他オプションは無視される。
      options.seasonRequested = true;
      options.season = getActiveSeason(new Date())?.key ?? null;
    }
    // 不明なトークンは無視
  }

  return options;
}

/**
 * メンション内容をパース
 * @param html status.content（HTML）
 * @param botAcct Botのアカウント名（@なし）
 * @param userDefaults ユーザーのデフォルト設定（オプション）
 */
export function parseMentionContent(html: string, botAcct: string, userDefaults?: UserDefaults): ParsedMention {
  // HTMLタグを除去
  let text = stripHtmlTags(html);

  // Botメンションを除去
  text = removeBotMention(text, botAcct);

  // コマンド部分を抽出 [...]
  const commandMatch = text.match(/\[([^\]]*)\]/);
  let options = buildDefaultOptions(userDefaults);

  if (commandMatch) {
    const commandOptions = parseCommandTokens(commandMatch[1]);
    options = { ...options, ...commandOptions };
    // コマンド部分を除去
    text = text.replace(/\[[^\]]*\]/, "").trim();
  }

  // 連続する空白を1つに（改行は保持）
  text = text.replace(/[^\S\n]+/g, " ").replace(/\n+/g, "\n").trim();

  return {
    text,
    options,
  };
}

const VISIBILITY_LABELS: Record<CommandVisibility, string> = {
  "public": "公開",
  "unlisted": "非収載",
};

/**
 * オプションを日本語のサマリー文字列に変換
 */
export function formatOptionsSummary(options: ParsedMentionOptions, defaultVisibility?: string): string {
  // シーズン（期間限定）時はスタイル系を上書きするので、シーズン名だけ示す。
  const parts: string[] = options.season
    ? [`シーズン: ${seasonLabel(options.season)}`]
    : [
        `位置: ${POSITION_LABELS[options.position]}`,
        `色: ${COLOR_LABELS[options.color]}`,
        `サイズ: ${SIZE_LABELS[options.size]}`,
        `フォント: ${FONT_LABELS[options.font]}`,
      ];

  if (!options.season && options.arrangement !== "none") {
    parts.push(`アレンジ: ${ARRANGEMENT_LABELS[options.arrangement]}`);
  }

  // visibility: コマンド指定があればそれを、なければデフォルト設定を表示
  if (options.visibility) {
    parts.push(`公開範囲: ${VISIBILITY_LABELS[options.visibility]}`);
  } else if (defaultVisibility) {
    const visLabel = defaultVisibility === "public" ? "公開" : defaultVisibility === "unlisted" ? "非収載" : "このサービスのみ";
    parts.push(`公開範囲: ${visLabel}(デフォルト)`);
  }

  parts.push(`debug: ${options.debug ? "on" : "off"}`);
  parts.push(`keep: ${options.keep ? "on" : "off"}`);

  return parts.join(" / ");
}
