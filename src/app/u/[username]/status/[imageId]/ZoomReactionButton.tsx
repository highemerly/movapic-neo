"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { ReactionEmojiView } from "@/components/reaction/ReactionEmojiView";
import { ReactionPickerModal } from "@/components/reaction/ReactionPickerModal";
import { useReactionActions } from "@/components/reaction/useReactionActions";
import type { ReactionMenuData } from "./ImageActionsMenu";

/**
 * 画像の全画面表示（ExpandableDetailImage）の中から、ズームを閉じずにリアクションするためのボタン。
 * 押すとピッカーを重ね、選んだら閉じてズームに戻り、選んだ絵文字を画像中央で一度弾ませて
 * 「付いた」ことを見せる（ズーム中はチップ行が見えないので、確認の手がかりが他に無い）。
 *
 * ズームが閉じている間もマウントしたままにする（`open` で描画だけ切る）。フックの状態は
 * reactionSync 経由の兄弟同期で最新に保たれるが、受け取れるのはマウント中に流れた変更だけなので、
 * 開いたときにだけマウントするとチップ行等で先に付けたリアクションを知らない古い初期値で始まる。
 *
 * pitfall: ズームのオーバーレイ（タップで閉じる onClick を持つ）の React 子孫に置かないこと。
 * ピッカーは Radix の Portal で DOM 上は body 直下に出るが、React の合成イベントは React ツリーを
 * 伝って上がるため、ピッカー内のタップがオーバーレイの onClick に届いてズームまで閉じてしまう。
 */
export function ZoomReactionButton({
  imageId,
  open,
  reaction,
}: {
  imageId: string;
  /** ズーム表示中か。閉じている間は何も描かない（状態は保持する）。 */
  open: boolean;
  reaction: ReactionMenuData;
}) {
  const { snapshot, viewerEmoji, handlePick, errorMessage } = useReactionActions(
    imageId,
    reaction.initialSnapshot,
    reaction.viewer
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // 中央で弾ませる絵文字。id は同じ絵文字を続けて選んだときもアニメを頭から再生し直すためのキー。
  const [burst, setBurst] = useState<{ id: number; emoji: string; imageUrl: string | null } | null>(
    null
  );

  // handlePick は「既に付いている絵文字を選び直したら解除」なので、解除のときは弾ませない。
  // 判定に使う現在値を ref で持つのは、onPick の identity を保つため（ピッカーの EmojiButton は
  // memo 済みで、ハンドラが変わると数千個ぶん再レンダーされ押下の応答に乗る＝ReactionPickerModal 参照）。
  const viewerEmojiRef = useRef(viewerEmoji);
  useEffect(() => {
    viewerEmojiRef.current = viewerEmoji;
  }, [viewerEmoji]);

  const onPick = useCallback(
    (emoji: string, imageUrl: string | null) => {
      const removing = emoji === viewerEmojiRef.current;
      handlePick(emoji, imageUrl);
      if (!removing) setBurst({ id: Date.now(), emoji, imageUrl });
    },
    [handlePick]
  );

  // 楽観表示で先に弾ませているので、失敗したら黙って巻き戻さず知らせる（ズーム中は他に表示先が無い）。
  useEffect(() => {
    if (errorMessage) toast.error(errorMessage);
  }, [errorMessage]);

  // 演出中にズームを閉じると animationend が来ないまま burst が残り、次に開いたとき前回の絵文字が
  // 再生される。閉じた時点で片付ける（effect ではなく描画中に前回値と比べて直す＝React 推奨の形）。
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setBurst(null);
  }

  const viewerChip = viewerEmoji
    ? snapshot.chips.find((chip) => chip.emoji === viewerEmoji)
    : undefined;

  return (
    <>
      {open &&
        createPortal(
          <>
            {burst && (
              <div
                key={burst.id}
                aria-hidden
                className="pointer-events-none fixed inset-0 z-[101] flex items-center justify-center"
              >
                <div
                  className="reaction-burst text-[96px] drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]"
                  onAnimationEnd={() => setBurst(null)}
                >
                  <ReactionEmojiView emoji={burst.emoji} imageUrl={burst.imageUrl} />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label={viewerEmoji ? "リアクションを変更する" : "リアクションを付ける"}
              title={viewerEmoji ? "リアクションを変更する" : "リアクションを付ける"}
              className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[101] flex h-13 min-w-13 -translate-x-1/2 items-center justify-center rounded-full bg-black/50 px-3 text-white transition-colors hover:bg-black/70 ${
                viewerEmoji ? "ring-2 ring-white/60" : ""
              }`}
            >
              {viewerEmoji ? (
                <span className="text-[28px]">
                  <ReactionEmojiView emoji={viewerEmoji} imageUrl={viewerChip?.imageUrl ?? null} />
                </span>
              ) : (
                <SmilePlus className="h-7 w-7" />
              )}
            </button>
          </>,
          document.body
        )}

      <ReactionPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={onPick}
        currentEmoji={viewerEmoji}
        sendsToFediverse={reaction.sendsToFediverse}
        viewerType={reaction.viewerType}
        viewerDomain={reaction.viewerDomain}
        // ズームのオーバーレイ（z-[100]）より手前に出す。Dialog 既定の z-50 だと背面に隠れる。
        className="z-[110]"
      />
    </>
  );
}
