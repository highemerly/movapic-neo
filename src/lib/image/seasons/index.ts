/**
 * シーズン（期間限定）の装飾背景ディスパッチャ。
 *
 * テキスト本体は既存の drawVerticalText / drawHorizontalText に任せ、ここでは
 * その「背後」に置く装飾レイヤー（短冊など）だけを描く。overlay キャンバスは透明で
 * 写真の上に alpha 合成されるので、半透明の帯がそのまま写真に乗る。
 *
 * ── 新しいシーズンを追加するには ──
 *   1. レジストリ src/lib/seasons/catalog.ts の SeasonDecoration に装飾種別を足し、
 *      その SeasonDef.decoration に設定する。
 *   2. このディレクトリに <season>.ts を作り、描画関数を export する
 *      （共通部品は ./shared を使う。例: seasons/tanabata.ts）。
 *   3. 下の switch に case を1つ足して描画関数へ委譲する。
 * 同時開催は1つの想定だが、定義・描画はシーズンごとに分離されるので衝突しない。
 */

import { CanvasRenderingContext2D } from "skia-canvas";
import type { SeasonDecoration } from "@/lib/seasons/catalog";
import { drawTanabata } from "./tanabata";

/** 装飾種別ごとに背景を描く。テキストより先に呼ぶこと。topInset=上部（穴）の余白。 */
export function drawSeasonBackground(
  ctx: CanvasRenderingContext2D,
  decoration: SeasonDecoration,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  margin: number,
  topInset: number
): void {
  switch (decoration) {
    case "tanzaku":
      drawTanabata(ctx, text, width, height, fontSize, margin, topInset);
      return;
  }
}
