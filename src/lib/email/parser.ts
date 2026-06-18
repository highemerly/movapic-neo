/**
 * メールパーサー
 * 件名からオプションを、本文からテキストを抽出
 */

import { simpleParser, ParsedMail, Attachment } from "mailparser";
import { Position, FontFamily, Color, Size, Arrangement, Visibility } from "@/types";
import {
  POSITION_MAP,
  COLOR_MAP,
  SIZE_MAP,
  FONT_MAP,
  ARRANGEMENT_MAP,
  VISIBILITY_MAP,
  decodeHtmlEntities,
} from "@/lib/options/maps";

/** 位置情報コマンドの解析結果（メール投稿のみ。none=保存しない） */
export type EmailLocationOption = "none" | "pref" | "city";

/** カメラ機種の保存有無（none=保存しない / show=機種名を保存） */
export type EmailCameraOption = "none" | "show";

export interface ParsedEmailOptions {
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  arrangement: Arrangement;
  /** 公開範囲（件名コマンドは公開/非収載のみ。localはユーザー設定からのみ） */
  visibility: Visibility;
  /** カメラ機種を保存するか（件名コマンド「機種」「機種なし」で上書き可） */
  cameraOption: EmailCameraOption;
  /** 件名コマンド「都道府県」「市町村」で指定。指定なしは none */
  locationOption: EmailLocationOption;
}

/** ユーザーがWebで保存した初期設定（null=未設定→ハードコードのデフォルトを使う） */
export interface EmailUserDefaults {
  position?: string | null;
  font?: string | null;
  color?: string | null;
  size?: string | null;
  arrangement?: string | null;
  visibility?: string | null;
  cameraOption?: string | null;
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

// 共通のオプションマップ（POSITION/COLOR/SIZE/FONT/ARRANGEMENT/VISIBILITY）は
// @/lib/options/maps から import。メール固有のカメラ・位置情報マップのみ以下に定義。

// カメラ機種コマンド。「カメラ」で保存、「カメラなし」で保存しない（ユーザー設定を上書き）。
const CAMERA_MAP: Record<string, EmailCameraOption> = {
  "カメラ": "show",
  "カメラなし": "none",
};

// 位置情報コマンド（メール投稿のみ）。EXIFのGPSから逆ジオコーディングして保存する。
const LOCATION_MAP: Record<string, EmailLocationOption> = {
  "都道府県": "pref",
  "市町村": "city",
};

// ユーザー設定も件名指定もない場合に使うハードコードのフォールバック
const FALLBACK_OPTIONS: ParsedEmailOptions = {
  position: "top",
  font: "hui-font",
  color: "white",
  size: "medium",
  arrangement: "none",
  visibility: "public",
  cameraOption: "none",
  locationOption: "none",
};

/**
 * ユーザーのWeb初期設定をベースにしたデフォルトオプションを構築する。
 * 優先順位: 件名コマンド > ユーザー設定 > FALLBACK_OPTIONS。
 * locationOption はユーザー設定に含めず、件名コマンドでのみ有効化する。
 */
function buildDefaultOptions(userDefaults?: EmailUserDefaults): ParsedEmailOptions {
  return {
    position: (userDefaults?.position as Position) || FALLBACK_OPTIONS.position,
    font: (userDefaults?.font as FontFamily) || FALLBACK_OPTIONS.font,
    color: (userDefaults?.color as Color) || FALLBACK_OPTIONS.color,
    size: (userDefaults?.size as Size) || FALLBACK_OPTIONS.size,
    arrangement: (userDefaults?.arrangement as Arrangement) || FALLBACK_OPTIONS.arrangement,
    visibility: (userDefaults?.visibility as Visibility) || FALLBACK_OPTIONS.visibility,
    cameraOption: (userDefaults?.cameraOption as EmailCameraOption) || FALLBACK_OPTIONS.cameraOption,
    locationOption: "none",
  };
}

/**
 * 件名からオプションを解析。
 * base（ユーザー設定をマージ済みのデフォルト）を起点に、件名で指定されたものだけ上書きする。
 */
function parseSubjectOptions(
  subject: string,
  base: ParsedEmailOptions
): ParsedEmailOptions {
  const options = { ...base };
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
    } else if (ARRANGEMENT_MAP[token]) {
      options.arrangement = ARRANGEMENT_MAP[token];
    } else if (VISIBILITY_MAP[token]) {
      options.visibility = VISIBILITY_MAP[token];
    } else if (CAMERA_MAP[token]) {
      options.cameraOption = CAMERA_MAP[token];
    } else if (LOCATION_MAP[token]) {
      options.locationOption = LOCATION_MAP[token];
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
export async function parseEmail(
  rawEmail: Buffer,
  userDefaults?: EmailUserDefaults
): Promise<ParsedEmail> {
  const parsed: ParsedMail = await simpleParser(rawEmail);

  const from = typeof parsed.from?.value?.[0]?.address === "string"
    ? parsed.from.value[0].address
    : "";

  const to = Array.isArray(parsed.to)
    ? (typeof parsed.to[0]?.value?.[0]?.address === "string" ? parsed.to[0].value[0].address : "")
    : (typeof parsed.to?.value?.[0]?.address === "string" ? parsed.to.value[0].address : "");

  // 件名からオプションを解析（ユーザー設定 > FALLBACK をベースに、件名指定で上書き）
  const options = parseSubjectOptions(
    parsed.subject || "",
    buildDefaultOptions(userDefaults)
  );

  // 本文からテキストを取得（改行を保持）
  let text = "";
  if (parsed.text) {
    text = parsed.text.trim();
  } else if (parsed.html) {
    // HTMLの場合はタグを除去してエンティティをデコード
    text = parsed.html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    text = decodeHtmlEntities(text);
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
