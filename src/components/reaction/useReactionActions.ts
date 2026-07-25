"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import {
  emitReaction,
  subscribeReaction,
  toSnapshot,
  type ReactionSnapshot,
} from "./reactionSync";

/**
 * リアクションの状態と操作（設定・付け替え・取り消し）をまとめて扱う client フック。
 *
 * 画像詳細ではリアクションの入口が複数ある（アクションバーの＋ボタン・チップ末尾の＋・
 * チップのポップオーバー内）。それぞれが同じ操作ロジックを持つと重複するため1本に集約する。
 * 各インスタンスは自分の snapshot を持ち、成功時に reactionSync 経由で兄弟へ配って同期する
 * （source of truth は各ローカル state のまま。詳細は reactionSync.ts）。
 */
export function useReactionActions(
  imageId: string,
  initialSnapshot: ReactionSnapshot
) {
  const [snapshot, setSnapshot] = useState<ReactionSnapshot>(initialSnapshot);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirm = useConfirm();

  // 他インスタンス（別の＋ボタン等）の操作結果を受信（受信側は emit しない＝echo防止）
  useEffect(() => subscribeReaction(imageId, setSnapshot), [imageId]);

  const submit = useCallback(
    async (emoji: string | null) => {
      if (isLoading) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/v1/images/${imageId}/reactions`, {
          method: emoji === null ? "DELETE" : "PUT",
          ...(emoji === null
            ? {}
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emoji }),
              }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message = body?.error?.message ?? "リアクションに失敗しました";
          const suggestion = body?.error?.suggestion;
          setErrorMessage(suggestion ? `${message}（${suggestion}）` : message);
          return;
        }
        const next = toSnapshot(await response.json());
        setSnapshot(next);
        // 成功時のみ配信（失敗は自インスタンス内で完結し、他インスタンスは元々未変更）
        emitReaction(imageId, next);
      } catch {
        setErrorMessage("リアクション中にエラーが発生しました");
      } finally {
        setIsLoading(false);
      }
    },
    [imageId, isLoading]
  );

  const viewerEmoji = snapshot.viewerEmoji;

  const handlePick = useCallback(
    (emoji: string) => {
      // 既に付いている絵文字をもう一度選んだら解除（Misskey と同じ操作感）
      void submit(emoji === viewerEmoji ? null : emoji);
    },
    [submit, viewerEmoji]
  );

  const removeWithConfirm = useCallback(async () => {
    const ok = await confirm({
      title: "リアクションを取り消す",
      description: "このリアクションを取り消します。よろしいですか？",
      confirmText: "取り消す",
      destructive: true,
    });
    if (ok) void submit(null);
  }, [confirm, submit]);

  return {
    snapshot,
    setSnapshot,
    isLoading,
    errorMessage,
    viewerEmoji,
    submit,
    handlePick,
    removeWithConfirm,
  };
}
