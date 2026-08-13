/**
 * 文字色オプション（白/赤/青/緑/黄/茶/桃/橙）を「印肉の色」に正規化する。
 *
 * 印肉は濃く鮮やかな顔料で、明るい黄や淡い桃のような色は物理的に存在しない。
 * 選んだ色相は残しつつ彩度・明度を印肉相当に寄せることで、どの色を選んでもハンコに見せる。
 *
 * 無彩色（白）は色相が無いので彩度を上げても灰色にしかならないが、朱に置き換えると
 * 「白を選んだのに赤いハンコが出る」ことになるため、正規化せずそのまま使う。
 */

/** HEX として解釈できない入力に対する既定（印肉の代表色＝朱肉）。 */
const VERMILION = "#C8102E";

// 印肉として成立する彩度・明度の範囲。上限を絞りすぎると色の違いが潰れるので下限側だけ強く効かせる。
const MIN_SATURATION = 0.8;
const MIN_LIGHTNESS = 0.33;
const MAX_LIGHTNESS = 0.45;

function hexToRgb01(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const to255 = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(hueToRgb(p, q, h + 1 / 3))}${to255(hueToRgb(p, q, h))}${to255(
    hueToRgb(p, q, h - 1 / 3)
  )}`.toUpperCase();
}

/**
 * 印影の外側に敷くハロー（にじみの下の薄い影）の色。
 *
 * ハンコには縁取りも影も無いため、写真と同系色・同明度だと印影が沈む。通常の文字と同じ
 * 「薄い色→黒／濃い色→白」の考え方で、輪郭の外だけに反対色をぼかして敷いて浮かせる。
 * 判定は選択された色名ではなく印肉化した後の実際の明るさ（相対輝度）で行う。
 * 正規化で緑・黄・橙などは元の色よりかなり暗くなるため、色名で決めると実態とずれる。
 */
export function toHaloColor(inkHex: string): string {
  const rgb = hexToRgb01(inkHex);
  if (!rgb) return "#000000";
  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return luminance > 0.45 ? "#000000" : "#FFFFFF";
}

/** 文字色 HEX → 印肉色 HEX。 */
export function toInkColor(hex: string): string {
  const rgb = hexToRgb01(hex);
  if (!rgb) return VERMILION;

  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (s === 0) return hex.toUpperCase();

  return hslToHex(h, Math.max(s, MIN_SATURATION), Math.max(MIN_LIGHTNESS, Math.min(MAX_LIGHTNESS, l)));
}
