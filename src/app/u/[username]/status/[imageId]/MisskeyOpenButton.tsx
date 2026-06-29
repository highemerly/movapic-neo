"use client";

import { useState } from "react";
import { Reply, Repeat2, Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Misskey viewer 向けの「あなたのサーバーで開く」ボタン。
 *
 * Misskey には Mastodon の authorize_interaction に相当する固定URLが無いため、
 * クリック時に /api/v1/misskey/resolve-note で ap/show 解決し、viewer サーバー上の
 * ノートURL（/notes/{id}）へ遷移する。
 *
 * 解決の間はボタンをローディング表示にし、解決が終わってから同じタブで遷移する
 * （非同期解決後の window.open はポップアップブロックされるため、新タブではなく同タブ）。
 */
export function MisskeyOpenButton({ postUrl }: { postUrl: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/misskey/resolve-note?url=${encodeURIComponent(postUrl)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "投稿を開けませんでした");
      }
      // 解決完了。同じタブで viewer サーバーのノートへ遷移（このまま離脱する）。
      window.location.href = data.url;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "投稿を開けませんでした"
      );
      // 遷移できなかった場合のみローディング解除（成功時はそのまま離脱する）
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex flex-auto items-center justify-center gap-1 h-[40px] px-1 border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border disabled:opacity-60"
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
