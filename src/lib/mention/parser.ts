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

// コマンドで指定可能なvisibility（public/unlistedのみ）
export type CommandVisibility = "public" | "unlisted";

export interface ParsedMentionOptions {
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  arrangement: Arrangement;
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
}

// オプションのマッピング（email parserと同じ）
const POSITION_MAP: Record<string, Position> = {
  "上": "top",
  "下": "bottom",
  "左": "left",
  "右": "right",
};

const COLOR_MAP: Record<string, Color> = {
  "白": "white",
  "赤": "red",
  "青": "blue",
  "緑": "green",
  "黄": "yellow",
  "茶": "brown",
  "桃": "pink",
  "橙": "orange",
};

const SIZE_MAP: Record<string, Size> = {
  "小": "small",
  "中": "medium",
  "大": "large",
  "特大": "extra-large",
};

const FONT_MAP: Record<string, FontFamily> = {
  "ふい字": "hui-font",
  "ゴシック": "noto-sans-jp",
  "ラノベ": "light-novel-pop",
};

const ARRANGEMENT_MAP: Record<string, Arrangement> = {
  "ネオン": "neon",
  "ハンコ": "stamp",
};

// コマンドで指定可能なvisibility（public/unlistedのみ）
const VISIBILITY_MAP: Record<string, CommandVisibility> = {
  "public": "public",
  "unlisted": "unlisted",
};

const FALLBACK_OPTIONS: ParsedMentionOptions = {
  position: "top",
  font: "hui-font",
  color: "white",
  size: "medium",
  arrangement: "none",
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
    arrangement: FALLBACK_OPTIONS.arrangement,
    debug: FALLBACK_OPTIONS.debug,
    keep: FALLBACK_OPTIONS.keep,
  };
}

// HTMLエンティティのデコード
const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": "\"",
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&copy;": "\u00A9",
  "&reg;": "\u00AE",
  "&trade;": "\u2122",
  "&ndash;": "\u2013",
  "&mdash;": "\u2014",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201C",
  "&rdquo;": "\u201D",
  "&hellip;": "\u2026",
  "&yen;": "\u00A5",
};

function decodeHtmlEntities(text: string): string {
  let decoded = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.split(entity).join(char);
  }

  // 数値エンティティをデコード (&#123; や &#x7B;)
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => {
    const num = parseInt(code, 10);
    return num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : "";
  });
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    const num = parseInt(code, 16);
    return num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : "";
  });

  return decoded;
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
  // @movapic や @movapic@handon.club などを除去
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

  // 連続する空白を1つに
  text = text.replace(/\s+/g, " ").trim();

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
  const parts = [
    `位置: ${POSITION_LABELS[options.position]}`,
    `色: ${COLOR_LABELS[options.color]}`,
    `サイズ: ${SIZE_LABELS[options.size]}`,
    `フォント: ${FONT_LABELS[options.font]}`,
  ];

  if (options.arrangement !== "none") {
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
