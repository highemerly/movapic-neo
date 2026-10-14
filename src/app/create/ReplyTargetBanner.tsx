"use client";

import { CornerDownRight, X } from "lucide-react";
import Link from "@/components/Link";
import type { ReplyTargetProps } from "./CreateClient";

/**
 * 投稿ページ上部の「スレッドに投稿する先」の表示。
 * target=null は「指定されたが見えない（削除・取り下げ）」＝通常の投稿になることを知らせる。
 * × で解除できる（誤って来た人が素の投稿に戻れるように）。
 */
export function ReplyTargetBanner({
  target,
  onClear,
}: {
  target: ReplyTargetProps | null;
  onClear: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      {target ? (
        <Link
          href={target.pageUrl}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {/* 保存サムネ（128px WebP）はデコードが軽くリトライ不要（docs/ui.md） */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={target.thumbnailUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded object-cover"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs">{target.authorLabel} の写真に続けて投稿</span>
            <span className="block truncate">{target.overlayText}</span>
          </span>
        </Link>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          スレッドに投稿する先の写真が見つかりません。通常の投稿になります。
        </p>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label="スレッドへの投稿をやめる"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
