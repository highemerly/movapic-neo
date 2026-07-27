"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ReactionChipPopover } from "./ReactionChipPopover";
import { ReactionPickerModal } from "./ReactionPickerModal";
import { useReactionActions } from "./useReactionActions";
import { emitReaction, toSnapshot, type ReactionSnapshot } from "./reactionSync";

/**
 * 画像詳細のリアクション一覧（絵文字＋件数）。実績チップの上に並べる。
 *
 * 各チップは枠なし・薄い背景の丸ピルで、押すとその場のポップオーバーで「リアクションした人」を
 * 見せる（ReactionChipPopover）。末尾の＋からはピッカーを開いてこの画面からリアクションできる。
 *
 * このページで唯一 API から最新状態を取りに行くインスタンスで、取得結果は reactionSync 経由で
 * モバイルのフローティングバーの＋ボタン（ReactionPickerButton）にも配る。
 */
export function ReactionChips({
  imageId,
  initialSnapshot,
  canReact,
  sendsToFediverse,
  viewerType,
  viewerDomain,
}: {
  imageId: string;
  initialSnapshot: ReactionSnapshot;
  canReact: boolean;
  /** この投稿へのリアクションが Fediverse にも送られるか（ピッカーの注釈に使う） */
  sendsToFediverse: boolean;
  /** 閲覧者のインスタンス種別／ドメイン。チップと同じ絵文字を送れるかの厳密判定に使う（未ログインは null） */
  viewerType: "mastodon" | "misskey" | null;
  viewerDomain: string | null;
}) {
  const { snapshot, setSnapshot, viewerEmoji, handlePick, removeWithConfirm } =
    useReactionActions(imageId, initialSnapshot);
  const [pickerOpen, setPickerOpen] = useState(false);

  // マウント時に最新状態へ同期（サーバー側でTTL切れ時のみオーナーへアクセスする）
  const hasSynced = useRef(false);
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;
    (async () => {
      try {
        const response = await fetch(`/api/v1/images/${imageId}/reactions`);
        if (!response.ok) return;
        const next = toSnapshot(await response.json());
        setSnapshot(next);
        emitReaction(imageId, next);
      } catch {
        setSnapshot((prev) => ({
          ...prev,
          statusMessage: "リアクションの同期に失敗しました",
        }));
      }
    })();
  }, [imageId, setSnapshot]);

  // リアクションが無く、追加もできない（未ログイン等）なら何も出さない
  if (snapshot.chips.length === 0 && !canReact) {
    return snapshot.statusMessage ? (
      <p className="mb-2 text-[11px] text-muted-foreground/70">{snapshot.statusMessage}</p>
    ) : null;
  }

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {snapshot.chips.map((chip) => (
          <ReactionChipPopover
            key={chip.emoji}
            chip={chip}
            users={snapshot.usersByEmoji[chip.emoji] ?? []}
            canReact={canReact}
            hasReacted={!!viewerEmoji}
            viewerType={viewerType}
            viewerDomain={viewerDomain}
            onReactSame={() => handlePick(chip.emoji)}
            onRemove={() => void removeWithConfirm()}
          />
        ))}
        {canReact && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="リアクションする"
            aria-label="リアクションする"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {snapshot.statusMessage && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">{snapshot.statusMessage}</p>
      )}

      {canReact && (
        <ReactionPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={handlePick}
          currentEmoji={viewerEmoji}
          sendsToFediverse={sendsToFediverse}
          viewerType={viewerType}
          viewerDomain={viewerDomain}
        />
      )}
    </div>
  );
}
