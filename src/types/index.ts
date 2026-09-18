export type Position = "top" | "right" | "left" | "bottom";

// horror-mincho は「肝試し」シーズン専用の限定フォント。VALID_FONTS には入れないため
// 通常の /create・generate・post では選択できず、シーズンのプリセット経由でのみ描画に使う。
// 型・ラベル・ファイル名は Record<FontFamily> の網羅性のためここに載せる必要がある。
export type FontFamily = "hui-font" | "noto-sans-jp" | "light-novel-pop" | "horror-mincho";

export type Color =
  | "white"
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "brown"
  | "pink"
  | "orange";

export type Size = "small" | "medium" | "large" | "extra-large";

export type OutputFormat = "mastodon" | "misskey" | "none";

export type Arrangement = "none" | "neon" | "stamp";

// カメラ撮影情報の保存レベル。none=保存しない / show=機種名・メーカーのみ /
// detail=機種名に加え撮影設定（F値・SS・ISO・焦点距離・レンズ・露出補正・フラッシュ）も保存。
// 後方互換のため show を中間に据える（既存の保存値・投稿を壊さない）。
export type CameraOption = "none" | "show" | "detail";

// シーズン（期間限定）。値はシーズンキー（"tanabata-2026" 等）で、定義は
// src/lib/seasons/catalog.ts のレジストリが持つ（型は文字列＝シーズンは随時追加されるため）。
// null/未指定 = 通常投稿。セット時は他のスタイルオプションを完全に上書きする特殊モード。
export type Season = string;

export interface GenerateParams {
  text: string;
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  output: OutputFormat;
  arrangement: Arrangement;
  season?: Season | null;
}

export interface GenerateFormState {
  text: string;
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  output: OutputFormat;
  arrangement: Arrangement;
  season: Season | null;
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
  "extra-large": "特大",
};

export const OUTPUT_LABELS: Record<OutputFormat, string> = {
  mastodon: "Mastodon用",
  misskey: "Misskey用",
  none: "なし",
};

export const ARRANGEMENT_LABELS: Record<Arrangement, string> = {
  none: "なし",
  neon: "ネオン",
  stamp: "ハンコ",
};

// 生成画像の上限バイト数。超えたら quality を下げて再エンコードする（applyOutputFormat）。
//
// SHAMEZO が保存する画像は連携先によらず必ず AVIF なので、上限も連携先ごとに分けない
// （OutputFormat は DB 列・UI ラベルとしてのみ残り、生成されるバイト列には影響しない）。
// 連携先ごとに違うのは「Fediverse へ送るときの形式」だけで、それは投稿直前に決める
// ＝ Mastodon だけ JPEG へ変換する（src/lib/fediverse/uploadFormat.ts）。
//
// Mastodon に AVIF を送れない理由（pitfall・Mastodon 4.7.2 の変更）:
// セキュリティ対応で libvips の HEIF ローダーがブロックされ（config/initializers/vips.rb の
// 許可リストから VipsForeignLoadHeif が削除）、同じローダーが担当する AVIF も読めなくなった。
// それでも supported_mime_types には image/avif が残るためアップロードは受理され、変換段で
// 500 "Error processing thumbnail for uploaded media" になる＝AVIF で送ると投稿が全て失敗する。
// もともと Mastodon は AVIF を受け取っても JPEG へ変換して保存・配信する
// （IMAGE_CONVERTIBLE_MIME_TYPES）ので、JPEG で送っても連合側に届く画像は変わらない。
//
// 値は Mastodon のアップロード上限（16MB）由来。Misskey は 250MB まで受けるが、
// 長辺 2048px の AVIF は実測 1MB 未満で桁が違うため、ゆるい側に合わせる理由がない。
export const AVIF_MAX_FILE_SIZE = 16 * 1024 * 1024;

export const FONT_LABELS: Record<FontFamily, string> = {
  "hui-font": "ふい字",
  "noto-sans-jp": "Noto Sans JP",
  "light-novel-pop": "ラノベPOP",
  "horror-mincho": "ふぉんとうは怖い明朝体",
};

// フォントファイル名のマッピング
export const FONT_FILES: Record<FontFamily, string> = {
  "hui-font": "HuiFont29.ttf",
  "noto-sans-jp": "NotoSansJP-Regular.ttf",
  "light-novel-pop": "LightNovelPOPv2.otf",
  // IPA明朝の派生フォント（IPA Font License v1.0）。無改変・リネームせず同梱すること。
  "horror-mincho": "ふぉんとうは怖い明朝体.otf",
};

// サイズ係数（mediumを1.0として）
export const SIZE_MULTIPLIERS: Record<Size, number> = {
  small: 0.75,
  medium: 1.0,
  large: 1.4,
  "extra-large": 2.35,
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
export const DEFAULT_ARRANGEMENT: Arrangement = "none";

// ユーザーのデフォルト設定
export interface UserPreferences {
  position: Position | null;
  font: FontFamily | null;
  color: Color | null;
  size: Size | null;
  output: OutputFormat | null;
  arrangement: Arrangement | null;
  visibility: Visibility | null;
}

// 公開範囲
export type Visibility = "public" | "unlisted" | "local";

const MASTODON_VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "公開投稿",
  unlisted: "非収載投稿",
  local: "なし",
};

// Misskey に「非収載」という公開範囲は無く、相当するのは「ホーム」。
// 値（unlisted）は共通で、投稿時に toMisskeyVisibility() が home へ変換する。
const MISSKEY_VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "公開",
  unlisted: "ホーム",
  local: "なし",
};

/** 連携先の用語に合わせた公開範囲ラベル（表示だけの出し分け）。 */
export function visibilityLabels(
  instanceType?: string | null
): Record<Visibility, string> {
  return instanceType === "misskey"
    ? MISSKEY_VISIBILITY_LABELS
    : MASTODON_VISIBILITY_LABELS;
}

export const MAX_TEXT_LENGTH = 140;
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
];

// バリデーション用の有効値リスト（型から自動生成）
export const VALID_POSITIONS: Position[] = ["top", "right", "left", "bottom"];
export const VALID_FONTS: FontFamily[] = ["hui-font", "noto-sans-jp", "light-novel-pop"];
export const VALID_COLORS: Color[] = ["white", "red", "blue", "green", "yellow", "brown", "pink", "orange"];
export const VALID_SIZES: Size[] = ["small", "medium", "large", "extra-large"];
export const VALID_OUTPUTS: OutputFormat[] = ["mastodon", "misskey", "none"];
export const VALID_ARRANGEMENTS: Arrangement[] = ["none", "neon", "stamp"];

// バリデーションヘルパー関数
export const isValidPosition = (v: unknown): v is Position => VALID_POSITIONS.includes(v as Position);
export const isValidFont = (v: unknown): v is FontFamily => VALID_FONTS.includes(v as FontFamily);
export const isValidColor = (v: unknown): v is Color => VALID_COLORS.includes(v as Color);
export const isValidSize = (v: unknown): v is Size => VALID_SIZES.includes(v as Size);
export const isValidOutput = (v: unknown): v is OutputFormat => VALID_OUTPUTS.includes(v as OutputFormat);
export const isValidArrangement = (v: unknown): v is Arrangement => VALID_ARRANGEMENTS.includes(v as Arrangement);
