"use client";

import { useCallback, useState } from "react";
import { Check, SmilePlus } from "lucide-react";
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
  const { isLoading, errorMessage, viewerEmoji, handlePick, removeWithConfirm } =
    useReactionActions(imageId, initialSnapshot);
  const [pickerOpen, setPickerOpen] = useState(false);

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
        // 塗り＋角丸（rounded-lg＝ページ内のカードと同じ角）のはっきりしたボタン。未リアクションは
        // primary で押下を促し、リアクション済みは secondary に落として「もう付けた」状態を控えめに
        // 見せる。下のコンテンツを隠しすぎないよう強めに透過させ、輪郭は枠線ではなく影と backdrop-blur
        // で出す（強い透過に枠線を足すと線だけが浮いて見えるため付けない）。影は既定色（黒10%前後）
        // だと写真の上で消えるので shadow-black/30 まで濃くして輪郭を成立させる。
        // ダークテーマでは黒い影が暗い背景に沈んで輪郭にならないため、代わりに白のリング（縁の
        // ハイライト）で浮かせる。ライトテーマで枠線が浮いて見えたのとは逆に、暗い背景では
        // 明るい細線が「上に乗っている」手掛かりになる。
        className={`flex h-[48px] items-center gap-1.5 rounded-lg px-3.5 shadow-xl shadow-black/30 backdrop-blur-xl transition-colors dark:ring-1 dark:ring-white/20 ${
          viewerEmoji
            ? // secondary はダークテーマだと暗い灰色＝暗背景に埋もれるので、塗りだけ濃いめにする
              // （primary はダークテーマでは明るい色なので輝度差で立ち、そのままで足りる）。
              "bg-secondary/35 dark:bg-secondary/70 text-secondary-foreground hover:bg-secondary/55 dark:hover:bg-secondary/85"
            : "bg-primary/45 text-primary-foreground hover:bg-primary/65"
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
        {viewerEmoji ? <Check className="h-6 w-6" /> : <SmilePlus className="h-6 w-6" />}
        {/* 総数はチップ行に出るのでボタンには載せない（重複回避）。
            リアクション済みは✓、未リアクションは＋アイコンだけで状態が分かる。どの絵文字を
            付けたかはチップ行（自分のチップが primary で塗られる）を見れば分かるので、ここでは
            「付けたかどうか」だけを示す。 */}
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
