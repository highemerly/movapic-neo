"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

// 最上部付近での出現/消失のちらつきを避けるためのしきい値（px）。
// これより下へスクロールしている時だけ「最新へ移動」ボタンを出す。
const SHOW_THRESHOLD = 300;

/**
 * 一覧の先頭（最新の投稿）まで戻るボタン。表示レイアウト切替の左に並ぶ、
 * ギャラリー共通のフローティング操作。既読管理でリロードしても最上部に戻らないため、
 * ワンタップで先頭へ移動できる導線を用意する。
 *
 * 最上部付近（scrollY <= しきい値）では何も描画しない＝「最上部ではない場合のみ」表示。
 */
export function ScrollToTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const update = () => setShow(window.scrollY > SHOW_THRESHOLD);
    update(); // 復元済みスクロール位置に対して初期状態を合わせる
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      aria-label="最新の投稿へ移動"
      title="最新へ移動"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="control-in pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border bg-background/80 text-muted-foreground opacity-50 shadow-sm backdrop-blur-sm transition hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
