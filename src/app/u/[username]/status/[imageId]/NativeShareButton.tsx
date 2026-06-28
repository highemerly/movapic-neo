"use client";

import { Share } from "lucide-react";
import { useNativeShare, type NativeShareParams } from "./useNativeShare";

/**
 * 広い画面（≥380px）で行内に出すネイティブ共有ボタン。
 * 狭い画面では非表示（その場合はミートボールメニュー内の項目で共有する）。
 */
export function NativeShareButton(props: NativeShareParams) {
  const { visible, share } = useNativeShare(props);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={share}
      className="hidden min-[380px]:flex flex-auto items-center justify-center gap-1.5 h-[40px] px-1.5 border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border"
      title="他のアプリで共有（写真も添付されます）"
    >
      <Share className="h-4 w-4 shrink-0" />
      <span className="text-[10px] font-medium">共有</span>
    </button>
  );
}
