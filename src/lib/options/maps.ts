/**
 * 日本語キーワード → オプション値のマッピング（共通）
 *
 * メール投稿（件名コマンド）と Bot メンション投稿（[...] コマンド）の
 * 両パーサーで共有する。各パーサー固有の項目（メールのカメラ/位置情報、
 * メンションの debug/keep）は各ファイル側に残す。
 */

import type { Position, FontFamily, Color, Size, Arrangement } from "@/types";

export const POSITION_MAP: Record<string, Position> = {
  "上": "top",
  "下": "bottom",
  "左": "left",
  "右": "right",
};

export const COLOR_MAP: Record<string, Color> = {
  "白": "white",
  "赤": "red",
  "青": "blue",
  "緑": "green",
  "黄": "yellow",
  "茶": "brown",
  "桃": "pink",
  "橙": "orange",
};

export const SIZE_MAP: Record<string, Size> = {
  "小": "small",
  "中": "medium",
  "大": "large",
  "特大": "extra-large",
};

export const FONT_MAP: Record<string, FontFamily> = {
  "ふい字": "hui-font",
  "ゴシック": "noto-sans-jp",
  "ラノベ": "light-novel-pop",
};

export const ARRANGEMENT_MAP: Record<string, Arrangement> = {
  "ネオン": "neon",
  "ハンコ": "stamp",
};

// コマンドで指定可能な公開範囲（public/unlistedのみ）。
// local はサービス内のみ保存で投稿の意図と矛盾するためコマンドでは指定不可。
export const VISIBILITY_MAP: Record<string, "public" | "unlisted"> = {
  "public": "public",
  "unlisted": "unlisted",
};

// HTMLエンティティのデコード
const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": "\"",
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&ndash;": "–",
  "&mdash;": "—",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&hellip;": "…",
  "&yen;": "¥",
};

/**
 * HTMLエンティティ（名前付き・数値）をデコードする
 */
export function decodeHtmlEntities(text: string): string {
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
