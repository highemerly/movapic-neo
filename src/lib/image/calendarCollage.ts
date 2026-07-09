/**
 * カレンダー画像（コラージュ）の描画。compute 専用。
 *
 * その月のサムネイル一覧をカレンダー型（7列×週）に並べ、上部に年月、下部に
 * ウォーターマーク（SHAMEZO＋ドメイン＋著作権）を焼き込んだ1枚のJPEGを生成する。
 * skia-canvas でグリッド・テキストを描き、最終エンコードは sharp（overlay.ts と同じ役割分担）。
 *
 * このモジュールは skia/sharp を top-level import するため、compute の
 * /api/internal/render-calendar ハンドラから **動的 import** される側でのみ評価される。
 * （web/worker-front で常駐させない。imageProcessor.ts と同じ運用）。
 */

import sharp from "sharp";
import { Canvas, CanvasRenderingContext2D, loadImage } from "skia-canvas";
import { ensureFontsLoaded } from "./fonts";
import type { CalendarCollageSpec } from "@/lib/calendar/collageTypes";

// レイアウト定数（128px サムネをそのまま使う＝軽量・非拡大）。
const CELL = 128;
const GAP = 6;
const PAD = 28;
const COLS = 7;
const HEADER_H = 108;
const WEEKDAY_H = 40;
const FOOTER_H = 92;

// 配色（手書き感に合わせた温かみのある紙色ベース）。
const BG = "#faf8f3";
const CELL_EMPTY_BG = "#ece6da";
const INK = "#3a352c";
const SUB_INK = "#8a8272";
const SUN = "#d1584f";
const SAT = "#4f7bd1";
// 写真上に日付を重ねるときの控えめな縁取り（DayCell の TEXT_OUTLINE 相当）。
const OUTLINE = "rgba(80,80,80,0.65)";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 全テキストをふい字に統一。ふい字に無いグリフ（ユーザー名の特殊文字）は
 * Noto Sans CJK JP、絵文字（👑・📱）は Noto Emoji にグリフ単位でフォールバックする。
 */
function huiFont(size: number): string {
  return `${size}px "HuiFont", "Noto Sans CJK JP", "Noto Emoji"`;
}

/** その月1日の曜日(0=日)。タイムゾーン非依存に UTC 正午で判定する。 */
function firstWeekdayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
}

/** その月の日数。 */
function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

type Ctx = CanvasRenderingContext2D;

/** 角丸矩形のパスを作る（roundRect 非対応版でも動くよう arcTo で構築）。 */
function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** セル領域を覆うように画像を中央クロップ描画（cover）。 */
function drawCover(
  ctx: Ctx,
  img: Awaited<ReturnType<typeof loadImage>>,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const iw = img.width || w;
  const ih = img.height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** 縁取り付きでテキストを1つ描く（写真上の視認性確保）。基準は現在の textAlign/textBaseline。 */
function fillTextOutlined(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  color: string,
  outlined: boolean
): void {
  if (outlined) {
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** その日の文字色（日/祝=赤・土=青・それ以外=白 or 平日色）。 */
function dayColor(col: number, isHoliday: boolean, onPhoto: boolean): string {
  const isRed = col === 0 || isHoliday;
  const isBlue = col === 6 && !isRed;
  if (isRed) return onPhoto ? "#f87171" : SUN;
  if (isBlue) return onPhoto ? "#60a5fa" : SAT;
  return onPhoto ? "#ffffff" : SUB_INK;
}

/**
 * セル中央下の日付（Web の DayCell と同じ位置）。
 * - 通常セル: 日番号を中央下に。
 * - 穴埋めセル: 穴の日を打ち消し線で消し、実際に埋めた投稿日を併記（例: 5̶ 20）。
 */
function drawDayNumber(
  ctx: Ctx,
  day: number,
  x: number,
  y: number,
  col: number,
  isHoliday: boolean,
  onPhoto: boolean,
  filledBy?: number
): void {
  const color = dayColor(col, isHoliday, onPhoto);
  const size = 22;
  ctx.font = huiFont(size);
  ctx.textBaseline = "alphabetic";
  const baseY = y + CELL - 9; // 中央下（下端から少し上）

  if (filledBy == null) {
    ctx.textAlign = "center";
    fillTextOutlined(ctx, String(day), x + CELL / 2, baseY, color, onPhoto);
    return;
  }

  // 穴埋め: [穴の日(打ち消し)] [埋めた投稿日]
  const holeStr = String(day);
  const fillStr = String(filledBy);
  const gap = 8;
  ctx.textAlign = "left";
  const holeW = ctx.measureText(holeStr).width;
  const fillW = ctx.measureText(fillStr).width;
  const totalW = holeW + gap + fillW;
  const startX = x + (CELL - totalW) / 2;

  // 穴の日（斜めの打ち消し線付き＝左下→右上のスラッシュ）
  fillTextOutlined(ctx, holeStr, startX, baseY, color, onPhoto);
  const x1 = startX - 2;
  const y1 = baseY + 3; // 左下
  const x2 = startX + holeW + 2;
  const y2 = baseY - size * 0.85; // 右上
  ctx.lineCap = "round";
  if (onPhoto) {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // 実際に埋めた投稿日
  fillTextOutlined(ctx, fillStr, startX + holeW + gap, baseY, color, onPhoto);
}

/**
 * カレンダー画像を生成する。
 * @param spec レイアウト・メタ情報
 * @param thumbnails spec.cells[].imageIndex が指すサムネ画像バッファ群
 */
export async function renderCalendarCollage(
  spec: CalendarCollageSpec,
  thumbnails: Buffer[]
): Promise<{ buffer: Buffer; contentType: string; width: number; height: number }> {
  ensureFontsLoaded();

  const { year, month } = spec;
  const holidays = new Set(spec.holidays);
  const fw = firstWeekdayOf(year, month);
  const dim = daysInMonthOf(year, month);
  const rows = Math.ceil((fw + dim) / 7);

  const gridW = COLS * CELL + (COLS - 1) * GAP;
  const gridH = rows * CELL + (rows - 1) * GAP;
  const width = PAD * 2 + gridW;
  const height = PAD + HEADER_H + WEEKDAY_H + gridH + FOOTER_H + PAD;

  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  const centerX = width / 2;

  // 背景
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // ヘッダー: 年月（皆勤月は👑を右に添える／文字は入れない）
  const title = `${year}年${month}月`;
  const headerY = PAD + HEADER_H / 2;
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  if (spec.isPerfect) {
    ctx.textAlign = "left";
    ctx.font = huiFont(56);
    const titleW = ctx.measureText(title).width;
    const crown = "👑";
    ctx.font = huiFont(44);
    const crownW = ctx.measureText(crown).width;
    const gap = 14;
    const startX = centerX - (titleW + gap + crownW) / 2;
    ctx.font = huiFont(56);
    ctx.fillStyle = INK;
    ctx.fillText(title, startX, headerY);
    ctx.font = huiFont(44);
    ctx.fillText(crown, startX + titleW + gap, headerY);
  } else {
    ctx.textAlign = "center";
    ctx.font = huiFont(56);
    ctx.fillText(title, centerX, headerY);
  }

  // 曜日ラベル（日=赤・土=青）
  const weekdayTop = PAD + HEADER_H;
  ctx.font = huiFont(20);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let c = 0; c < COLS; c++) {
    const cx = PAD + c * (CELL + GAP) + CELL / 2;
    ctx.fillStyle = c === 0 ? SUN : c === 6 ? SAT : SUB_INK;
    ctx.fillText(WEEKDAY_LABELS[c], cx, weekdayTop + WEEKDAY_H / 2);
  }

  // グリッド
  const gridTop = weekdayTop + WEEKDAY_H;
  const cellByDay = new Map(spec.cells.map((c) => [c.day, c]));
  const images = await Promise.all(thumbnails.map((b) => loadImage(b)));

  for (let day = 1; day <= dim; day++) {
    const idx = fw + day - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = PAD + col * (CELL + GAP);
    const y = gridTop + row * (CELL + GAP);
    const cell = cellByDay.get(day);
    const isHoliday = holidays.has(day);

    roundRectPath(ctx, x, y, CELL, CELL, 12);
    if (cell && images[cell.imageIndex]) {
      ctx.save();
      ctx.clip();
      drawCover(ctx, images[cell.imageIndex], x, y, CELL, CELL);
      // 下方グラデーション（日付の視認性確保・DayCell と同じ）
      const grad = ctx.createLinearGradient(0, y + CELL * 0.55, 0, y + CELL);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y + CELL * 0.55, CELL, CELL * 0.45);
      ctx.restore();
      drawDayNumber(
        ctx,
        day,
        x,
        y,
        col,
        isHoliday,
        true,
        cell.kind === "makeup" ? cell.filledBy : undefined
      );
    } else {
      ctx.fillStyle = CELL_EMPTY_BG;
      ctx.fill();
      drawDayNumber(ctx, day, x, y, col, isHoliday, false);
    }
  }

  // フッター: ウォーターマーク（📱SHAMEZO を大きく＋ドメイン＋著作権）
  const footerTop = gridTop + gridH;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 1行目: 📱 SHAMEZO（大きめ）＋ドメインを併記
  const brandY = footerTop + FOOTER_H * 0.38;
  ctx.font = huiFont(34);
  const brand = `📱${spec.serviceName}`;
  const brandW = ctx.measureText(brand).width;
  ctx.font = huiFont(20);
  const domainStr = spec.appDomain ? `  ${spec.appDomain}` : "";
  const domainW = domainStr ? ctx.measureText(domainStr).width : 0;
  const line1Start = centerX - (brandW + domainW) / 2;
  ctx.textAlign = "left";
  ctx.font = huiFont(34);
  ctx.fillStyle = INK;
  ctx.fillText(brand, line1Start, brandY);
  if (domainStr) {
    ctx.font = huiFont(20);
    ctx.fillStyle = SUB_INK;
    ctx.fillText(domainStr, line1Start + brandW, brandY + 4);
  }
  // 2行目: © (ふい字は © グリフが空なので Noto から拾う) ＋ ハンドル(ふい字)
  const crSize = 19;
  const crY = footerTop + FOOTER_H * 0.78;
  const sym = "©";
  ctx.textAlign = "left";
  ctx.fillStyle = SUB_INK;
  ctx.font = `${crSize}px "Noto Sans CJK JP"`;
  const symW = ctx.measureText(sym).width;
  const crGap = 5;
  ctx.font = huiFont(crSize);
  const handleW = ctx.measureText(spec.authorHandle).width;
  const crStart = centerX - (symW + crGap + handleW) / 2;
  ctx.font = `${crSize}px "Noto Sans CJK JP"`;
  ctx.fillText(sym, crStart, crY);
  ctx.font = huiFont(crSize);
  ctx.fillText(spec.authorHandle, crStart + symW + crGap, crY);
  ctx.textAlign = "center";

  // 最終エンコードは sharp（JPEG）。Fediverse 両対応・普遍性を優先。
  const png = Buffer.from(await canvas.toBuffer("png"));
  const buffer = await sharp(png)
    .jpeg({ quality: 88, chromaSubsampling: "4:2:0" })
    .toBuffer();

  return { buffer, contentType: "image/jpeg", width, height };
}
