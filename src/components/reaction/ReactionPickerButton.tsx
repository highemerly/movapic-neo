"use client";

import { useCallback, useState } from "react";
import { SmilePlus } from "lucide-react";
import { ReactionEmojiView } from "./ReactionEmojiView";
import { ReactionPickerModal } from "./ReactionPickerModal";
import { useReactionActions } from "./useReactionActions";
import type { ReactionSnapshot } from "./reactionSync";

/**
 * リアクションを付ける「＋」ボタン（画像詳細のアクションバー）。
 *
 * PC のインライン行とモバイルのフローティングバーに1つずつマウントされる（CSSで出し分け）。
 * 状態と操作は useReactionActions に集約し、最新状態の取得は ReactionChips に任せて
 * reactionSync 経由で受け取る。操作結果はフック側が emit してチップ行・もう片方へ配る。
 */
export function ReactionPickerButton({
  imageId,
  initialSnapshot,
  canReact,
  disabledReason,
  floating = false,
}: {
  imageId: string;
  initialSnapshot: ReactionSnapshot;
  canReact: boolean;
  disabledReason?: string;
  /** フローティング（透過コンテナ上）で使うか。自前の背景＋影を付けて浮いて見せる。 */
  floating?: boolean;
}) {
  const { snapshot, isLoading, errorMessage, viewerEmoji, handlePick, removeWithConfirm } =
    useReactionActions(imageId, initialSnapshot);
  const [pickerOpen, setPickerOpen] = useState(false);

  const viewerChip = snapshot.chips.find((chip) => chip.emoji === viewerEmoji);

  // ボタン押下: 未リアクションならピッカーを開く。リアクション済みなら、確認のうえ取り消す
  // （付け替えたい場合は一度取り消してから選び直す）。
  const handleButtonClick = useCallback(async () => {
    if (!viewerEmoji) {
      setPickerOpen(true);
      return;
    }
    await removeWithConfirm();
  }, [viewerEmoji, removeWithConfirm]);

  return (
    <div className="relative shrink-0 pointer-events-auto">
      <button
        type="button"
        onClick={() => void handleButtonClick()}
        disabled={!canReact || isLoading}
        className={`flex h-[44px] items-center gap-1.5 rounded-md border px-3 transition-colors ${
          floating ? "bg-background/60 backdrop-blur-xl shadow-md " : ""
        }${
          viewerEmoji
            ? "border-brand/50 text-foreground"
            : "border-border text-muted-foreground hover:text-foreground"
        } ${!canReact ? "cursor-not-allowed opacity-50" : ""}`}
        title={
          errorMessage ??
          (!canReact
            ? disabledReason
            : viewerEmoji
              ? "リアクションを取り消す"
              : "リアクションする")
        }
        aria-label={viewerEmoji ? "リアクションを取り消す" : "リアクションする"}
      >
        {viewerEmoji ? (
          <ReactionEmojiView emoji={viewerEmoji} imageUrl={viewerChip?.imageUrl} />
        ) : (
          <SmilePlus className="h-4 w-4" />
        )}
        {/* 総数はチップ行に出るのでボタンには載せない（重複回避）。
            リアクション済みは絵文字、未リアクションは＋アイコンだけで状態が分かる。 */}
      </button>

      {canReact && (
        <ReactionPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={handlePick}
          currentEmoji={viewerEmoji}
        />
      )}
    </div>
  );
}
