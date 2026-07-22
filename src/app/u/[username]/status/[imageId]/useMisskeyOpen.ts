"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { parseApiError, formatErrorMessage } from "@/lib/errors";

/**
 * Misskey viewer 向け「あなたのサーバーで開く」の共通ロジック。
 *
 * Misskey には Mastodon の authorize_interaction に相当する固定URLが無いため、
 * クリック時に /api/v1/misskey/resolve-note で ap/show 解決し、viewer サーバー上の
 * ノートURL（/notes/{id}）へ遷移する。解決の間はローディング表示にし、解決後に同じタブで
 * 遷移する（非同期解決後の window.open はポップアップブロックされるため新タブにしない）。
 *
 * 行内ボタン（MisskeyOpenButton）とミートボールメニューの双方で使う。
 */
export function useMisskeyOpen(postUrl: string) {
  const [loading, setLoading] = useState(false);

  const open = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/misskey/resolve-note?url=${encodeURIComponent(postUrl)}`
      );
      if (!res.ok) {
        throw new Error(formatErrorMessage(await parseApiError(res)));
      }
      const data = await res.json().catch(() => ({}));
      if (!data.url) {
        throw new Error("投稿を開けませんでした");
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
  }, [loading, postUrl]);

  return { loading, open };
}
