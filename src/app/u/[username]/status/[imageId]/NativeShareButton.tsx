"use client";

import { Share } from "lucide-react";
import { useNativeShare, type NativeShareParams } from "./useNativeShare";

/**
 * 広い画面（≥380px）で行内に出すネイティブ共有ボタン。
 * Web Share API 対応時のみ表示（＝HTTPS/localhost のセキュアコンテキスト）。非対応・狭い画面では
 * 非表示で、その場合はミートボールメニュー内の項目で共有する。
 * floating: モバイル下部のフローティングバー用。実寸ピル化し自前の背景＋影を付ける。
 * 既定（PCインライン）は行幅いっぱいに伸ばす。
 */
export function NativeShareButton({
  floating = false,
  ...props
}: NativeShareParams & { floating?: boolean }) {
  const { visible, share } = useNativeShare(props);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={share}
      className={
        floating
          ? "pointer-events-auto hidden min-[380px]:flex shrink-0 items-center justify-center gap-1.5 h-[44px] px-3 border rounded-md bg-background/60 backdrop-blur-xl shadow-md transition-colors text-muted-foreground hover:text-foreground border-border"
          : "hidden min-[380px]:flex flex-auto items-center justify-center gap-1.5 h-[44px] px-1.5 border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border"
      }
      title="他のアプリで共有（写真も添付されます）"
    >
      <Share className="h-4 w-4 shrink-0" />
      <span className="text-[10px] font-medium">共有</span>
    </button>
  );
}
