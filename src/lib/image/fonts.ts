/**
 * skia-canvas 用フォントの一元ロード。
 *
 * 文字入れ（overlay.ts）とカレンダー画像（calendarCollage.ts）が同じフォントを使うため、
 * 同一プロセス（compute）で両方が読み込まれても二重登録しないようモジュール内で1回に固定する。
 * どちらも「compute ハンドラ実行時に動的 import される側」からのみ読まれる想定。
 */

import path from "path";
import { FontLibrary } from "skia-canvas";

let loaded = false;

/** フォント（ふい字・Noto Sans JP・ラノベ・絵文字）を1回だけ登録する。 */
export function ensureFontsLoaded(): void {
  if (loaded) return;
  const fontsDir = path.join(process.cwd(), "fonts");
  // eslint-disable-next-line react-hooks/rules-of-hooks
  FontLibrary.use([
    path.join(fontsDir, "HuiFont29.ttf"),
    path.join(fontsDir, "NotoSansJP-Regular.ttf"),
    path.join(fontsDir, "LightNovelPOPv2.otf"),
    // 絵文字（モノクロ）。本文フォントが持たない絵文字グリフをフォールバックで描画する。
    path.join(fontsDir, "NotoEmoji-VariableFont_wght.ttf"),
  ]);
  loaded = true;
}
