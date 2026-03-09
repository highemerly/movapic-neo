export type Position = "top" | "right" | "left" | "bottom";

export type FontFamily = "hui-font" | "noto-sans-jp" | "light-novel-pop";

export type Color =
  | "white"
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "brown"
  | "pink"
  | "orange";

export type Size = "small" | "medium" | "large";

export type OutputFormat = "mastodon" | "misskey" | "none";

export interface GenerateParams {
  text: string;
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  output: OutputFormat;
}

export interface GenerateFormState {
  text: string;
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  output: OutputFormat;
  imageFile: File | null;
  imagePreview: string | null;
}

export const COLORS: Record<Color, string> = {
  white: "#FFFFFF",
  red: "#FF0000",
  blue: "#0000FF",
  green: "#00FF00",
  yellow: "#FFFF00",
  brown: "#8B4513",
  pink: "#FFC0CB",
  orange: "#FFA500",
};

export const COLOR_LABELS: Record<Color, string> = {
  white: "白",
  red: "赤",
  blue: "青",
  green: "緑",
  yellow: "黄",
  brown: "茶",
  pink: "桃",
  orange: "橙",
};

export const POSITION_LABELS: Record<Position, string> = {
  top: "上",
  right: "右",
  left: "左",
  bottom: "下",
};

export const SIZE_LABELS: Record<Size, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

export const OUTPUT_LABELS: Record<OutputFormat, string> = {
  mastodon: "Mastodon用",
  misskey: "Misskey用",
  none: "なし",
};

// 出力形式の設定
export const OUTPUT_CONFIG: Record<OutputFormat, { maxSize: number; maxFileSize: number; format: "avif" | "jpeg" } | null> = {
  mastodon: { maxSize: 2048, maxFileSize: 16 * 1024 * 1024, format: "avif" }, // 16MB, AVIF
  misskey: { maxSize: 2048, maxFileSize: 250 * 1024 * 1024, format: "avif" }, // 250MB, AVIF
  none: null, // JPEG, リサイズなし
};

export const FONT_LABELS: Record<FontFamily, string> = {
  "hui-font": "ふい字",
  "noto-sans-jp": "Noto Sans JP",
  "light-novel-pop": "ラノベPOP",
};

// フォントファイル名のマッピング
export const FONT_FILES: Record<FontFamily, string> = {
  "hui-font": "HuiFont29.ttf",
  "noto-sans-jp": "NotoSansJP-Regular.ttf",
  "light-novel-pop": "LightNovelPOPv2.otf",
};

// サイズ係数（mediumを1.0として）
export const SIZE_MULTIPLIERS: Record<Size, number> = {
  small: 0.7,
  medium: 1.0,
  large: 1.4,
};

// 縁取りの色（薄い色は黒、濃い色は白）
export const STROKE_COLORS: Record<Color, string> = {
  white: "#000000",
  red: "#FFFFFF",
  blue: "#FFFFFF",
  green: "#000000",
  yellow: "#000000",
  brown: "#FFFFFF",
  pink: "#000000",
  orange: "#000000",
};

// デフォルト値
export const DEFAULT_POSITION: Position = "top";
export const DEFAULT_FONT: FontFamily = "hui-font";
export const DEFAULT_COLOR: Color = "white";
export const DEFAULT_SIZE: Size = "medium";
export const DEFAULT_OUTPUT: OutputFormat = "mastodon";

export const MAX_TEXT_LENGTH = 140;
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
export const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
];
