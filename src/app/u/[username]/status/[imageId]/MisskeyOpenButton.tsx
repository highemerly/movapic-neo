"use client";

import { Reply, Repeat2, Bookmark, Loader2 } from "lucide-react";
import { useMisskeyOpen } from "./useMisskeyOpen";

/**
 * Misskey viewer 向けの行内「あなたのサーバーで開く」ボタン。
 * 解決ロジックは useMisskeyOpen に切り出し、ミートボールメニューと共有している。
 */
/**
 * floating: モバイル下部のフローティングバー用。実寸ピル化し自前の背景＋影を付ける
 * （帯を敷かない透過バー上でも読めるように）。既定（PCインライン）は行幅いっぱいに伸ばす。
 */
export function MisskeyOpenButton({
  postUrl,
  floating = false,
}: {
  postUrl: string;
  floating?: boolean;
}) {
  const { loading, open } = useMisskeyOpen(postUrl);

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className={
        floating
          ? "pointer-events-auto flex shrink-0 items-center justify-center gap-1 h-[44px] px-2 border rounded-md bg-background/60 backdrop-blur-xl shadow-md transition-colors text-muted-foreground hover:text-foreground border-border disabled:opacity-60"
          : "flex flex-auto items-center justify-center gap-1 h-[44px] px-1 border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border disabled:opacity-60"
      }
      title="あなたのサーバーでこの投稿を開きます（返信・リノート・リアクションができます）"
    >
      <span className="flex shrink-0 items-center gap-0.5">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Reply className="h-4 w-4" />
            <Repeat2 className="h-4 w-4" />
            <Bookmark className="h-4 w-4" />
          </>
        )}
      </span>
      <span className="flex flex-col items-start leading-tight text-[10px] font-medium">
        <span>あなたの</span>
        <span>{loading ? "サーバーへ移動中…" : "サーバーで開く"}</span>
      </span>
    </button>
  );
}
