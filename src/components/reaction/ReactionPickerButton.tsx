"use client";

import { useCallback, useState } from "react";
import { SmilePlus } from "lucide-react";
import { ReactionEmojiView } from "./ReactionEmojiView";
import { ReactionPickerModal } from "./ReactionPickerModal";
import { useReactionActions } from "./useReactionActions";
import type { ReactionSnapshot } from "./reactionSync";

/**
 * リアクションを付ける「＋」ボタン（画像詳細のモバイル用フローティングバー）。
 *
 * 状態と操作は useReactionActions に集約し、最新状態の取得は ReactionChips に任せて
 * reactionSync 経由で受け取る。操作結果はフック側が emit してチップ行へ配る。
 */
export function ReactionPickerButton({
  imageId,
  initialSnapshot,
  canReact,
  sendsToFediverse,
  viewerType,
  viewerDomain,
  disabledReason,
}: {
  imageId: string;
  initialSnapshot: ReactionSnapshot;
  canReact: boolean;
  /** この投稿へのリアクションが Fediverse にも送られるか（ピッカーの注釈に使う） */
  sendsToFediverse: boolean;
  /** 閲覧者のインスタンス種別／ドメイン。ピッカーの注釈の文言に使う（未ログインは null） */
  viewerType: "mastodon" | "misskey" | null;
  viewerDomain: string | null;
  disabledReason?: string;
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
        // 塗り＋まん丸のはっきりしたボタン。未リアクションは primary で押下を促し、リアクション済みは
        // secondary に落として「もう付けた」状態を控えめに見せる。完全な不透明だと下のコンテンツと
        // 同化するので、少し透過＋backdrop-blur ＋縁取り（border-border）で浮遊感を出す。
        className={`flex h-[44px] items-center gap-1.5 rounded-full border border-border px-3 shadow-lg backdrop-blur-xl transition-colors ${
          viewerEmoji
            ? "bg-secondary/65 text-secondary-foreground hover:bg-secondary/80"
            : "bg-primary/75 text-primary-foreground hover:bg-primary/90"
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
          sendsToFediverse={sendsToFediverse}
          viewerType={viewerType}
          viewerDomain={viewerDomain}
        />
      )}
    </div>
  );
}
