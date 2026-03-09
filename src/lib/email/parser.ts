/**
 * メールパーサー
 * 件名からオプションを、本文からテキストを抽出
 */

import { simpleParser, ParsedMail, Attachment } from "mailparser";
import { Position, FontFamily, Color, Size } from "@/types";

export interface ParsedEmailOptions {
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
}

export interface ParsedEmail {
  from: string;
  to: string;
  text: string;
  options: ParsedEmailOptions;
  image: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  } | null;
}

// オプションのマッピング
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
};

const FONT_MAP: Record<string, FontFamily> = {
  "ふい字": "hui-font",
  "ゴシック": "noto-sans-jp",
  "ラノベ": "light-novel-pop",
};

const DEFAULT_OPTIONS: ParsedEmailOptions = {
  position: "top",
  font: "hui-font",
  color: "white",
  size: "medium",
};

/**
 * 件名からオプションを解析
 */
function parseSubjectOptions(subject: string): ParsedEmailOptions {
  const options = { ...DEFAULT_OPTIONS };
  const tokens = subject.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    if (POSITION_MAP[token]) {
      options.position = POSITION_MAP[token];
    } else if (COLOR_MAP[token]) {
      options.color = COLOR_MAP[token];
    } else if (SIZE_MAP[token]) {
      options.size = SIZE_MAP[token];
    } else if (FONT_MAP[token]) {
      options.font = FONT_MAP[token];
    }
    // 不明なトークンは無視
  }

  return options;
}

/**
 * 添付ファイルから画像を抽出
 */
function extractImage(attachments: Attachment[]): ParsedEmail["image"] {
  for (const attachment of attachments) {
    const contentType = attachment.contentType?.toLowerCase() || "";
    if (
      contentType.startsWith("image/") &&
      (contentType.includes("jpeg") ||
        contentType.includes("png") ||
        contentType.includes("webp") ||
        contentType.includes("heic") ||
        contentType.includes("heif") ||
        contentType.includes("avif"))
    ) {
      return {
        buffer: attachment.content,
        filename: attachment.filename || "image",
        contentType: attachment.contentType || "image/jpeg",
      };
    }
  }
  return null;
}

/**
 * メールをパース
 */
export async function parseEmail(rawEmail: Buffer): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(rawEmail);

  const from = typeof parsed.from?.value?.[0]?.address === "string"
    ? parsed.from.value[0].address
    : "";

  const to = Array.isArray(parsed.to)
    ? (typeof parsed.to[0]?.value?.[0]?.address === "string" ? parsed.to[0].value[0].address : "")
    : (typeof parsed.to?.value?.[0]?.address === "string" ? parsed.to.value[0].address : "");

  // 件名からオプションを解析
  const options = parseSubjectOptions(parsed.subject || "");

  // 本文からテキストを取得（改行を保持）
  let text = "";
  if (parsed.text) {
    text = parsed.text.trim();
  } else if (parsed.html) {
    // HTMLの場合は簡易的にタグを除去
    text = parsed.html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  // 140文字に制限
  if (text.length > 140) {
    text = text.substring(0, 140);
  }

  // 添付ファイルから画像を抽出
  const image = extractImage(parsed.attachments || []);

  return {
    from,
    to,
    text,
    options,
    image,
  };
}
