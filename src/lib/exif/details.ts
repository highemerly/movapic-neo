/**
 * EXIF 詳細撮影情報（F値・シャッター速度・ISO 等）の整形とサニタイズ。
 *
 * 表示専用。値は「表示済み文字列」で持つ（例 "f/2.8" "1/250" "ISO 400"）。
 * - formatExifDetails: exifr の生値 → 表示文字列（クライアント/サーバー共通の純粋関数）
 * - sanitizeExifDetails: クライアントが JSON で送ってきた値を、ホワイトリスト＋
 *   文字数上限で受け直す（cameraModel を 100 字 slice するのと同じ信頼モデル）。
 *
 * 撮影方向・撮影日時・GPS はここでは扱わない（位置情報カテゴリとして別管理・非取得）。
 */

// 表示順もこの定義順に従う（画像詳細モーダルで上から順に並べる）。
export interface ExifDetails {
  lens?: string; // レンズ名（LensModel / LensMake）
  focalLength?: string; // 焦点距離 "50mm"
  focalLength35?: string; // 35mm換算 "35mm換算 75mm"
  fNumber?: string; // F値 "f/2.8"
  exposureTime?: string; // シャッター速度 "1/250" / "1.3秒"
  iso?: string; // ISO感度 "ISO 400"
  exposureBias?: string; // 露出補正 "+0.7 EV" / "±0 EV"
  flash?: string; // フラッシュ "発光" / "非発光"
}

// 表示ラベル（モーダルの各行の見出し）。keyof ExifDetails 網羅で drift を防ぐ。
export const EXIF_DETAIL_LABELS: Record<keyof ExifDetails, string> = {
  lens: "レンズ",
  focalLength: "焦点距離",
  focalLength35: "35mm換算",
  fNumber: "F値",
  exposureTime: "シャッター速度",
  iso: "ISO感度",
  exposureBias: "露出補正",
  flash: "フラッシュ",
};

const MAX_VALUE_LEN = 100;

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// シャッター速度: 1秒未満は "1/250"、1秒以上は "1.3秒"。
function formatExposureTime(sec: number): string | null {
  if (sec <= 0) return null;
  if (sec >= 1) {
    // 3秒 → "3秒"、1.3秒 → "1.3秒"
    const rounded = Math.round(sec * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}秒`;
  }
  return `1/${Math.round(1 / sec)}`;
}

// 露出補正: 符号付き。0 は "±0 EV"、小数は最大2桁。
function formatExposureBias(ev: number): string {
  if (ev === 0) return "±0 EV";
  const sign = ev > 0 ? "+" : "-";
  const abs = Math.abs(ev);
  const rounded = Math.round(abs * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${sign}${text} EV`;
}

/**
 * exifr の生パース結果から詳細撮影情報を整形する。
 * 欠損・不正値の項目は結果に含めない（undefined のまま＝表示しない）。
 */
export function formatExifDetails(raw: Record<string, unknown>): ExifDetails {
  const out: ExifDetails = {};

  // レンズ名: LensModel 優先。無ければ LensMake。
  const lens = nonEmptyString(raw.LensModel) ?? nonEmptyString(raw.LensMake);
  if (lens) out.lens = lens.slice(0, MAX_VALUE_LEN);

  const focal = toFiniteNumber(raw.FocalLength);
  if (focal != null && focal > 0) {
    out.focalLength = `${Math.round(focal * 10) / 10}mm`;
  }

  const focal35 = toFiniteNumber(raw.FocalLengthIn35mmFormat);
  if (focal35 != null && focal35 > 0) {
    out.focalLength35 = `35mm換算 ${Math.round(focal35)}mm`;
  }

  const fnum = toFiniteNumber(raw.FNumber);
  if (fnum != null && fnum > 0) {
    out.fNumber = `f/${Math.round(fnum * 10) / 10}`;
  }

  const exp = toFiniteNumber(raw.ExposureTime);
  if (exp != null) {
    const t = formatExposureTime(exp);
    if (t) out.exposureTime = t;
  }

  const iso = toFiniteNumber(raw.ISO);
  if (iso != null && iso > 0) {
    out.iso = `ISO ${Math.round(iso)}`;
  }

  const bias = toFiniteNumber(raw.ExposureBiasValue);
  if (bias != null) {
    out.exposureBias = formatExposureBias(bias);
  }

  // Flash: exifr は数値ビットフィールドまたは文字列を返しうる。最下位ビット=発光。
  const flashRaw = raw.Flash;
  if (typeof flashRaw === "number") {
    out.flash = (flashRaw & 0x1) === 1 ? "発光" : "非発光";
  } else if (typeof flashRaw === "string" && flashRaw.trim()) {
    // "Fired" / "No flash" 等の文言から発光有無を推定
    out.flash = /no flash|not fire|off|did not fire/i.test(flashRaw)
      ? "非発光"
      : "発光";
  }

  return out;
}

/** 何か1項目でも埋まっていれば true。 */
export function hasAnyExifDetail(d: ExifDetails | null | undefined): boolean {
  return !!d && Object.keys(d).length > 0;
}

/** 定義順（レンズ→焦点距離→…）で、値のある項目の表示文字列だけを返す（ラベルなし）。 */
export function exifDetailValues(d: ExifDetails | null | undefined): string[] {
  if (!d) return [];
  return (Object.keys(EXIF_DETAIL_LABELS) as (keyof ExifDetails)[])
    .map((key) => d[key])
    .filter((v): v is string => !!v);
}

/**
 * クライアント送信の JSON を受け直す。既知キーのみ・文字列のみ・長さ上限で受け付け、
 * 1項目も残らなければ null を返す（DB に空 {} を書かない）。
 */
export function sanitizeExifDetails(input: unknown): ExifDetails | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: ExifDetails = {};
  for (const key of Object.keys(EXIF_DETAIL_LABELS) as (keyof ExifDetails)[]) {
    const v = src[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = v.trim().slice(0, MAX_VALUE_LEN);
    }
  }
  return hasAnyExifDetail(out) ? out : null;
}
