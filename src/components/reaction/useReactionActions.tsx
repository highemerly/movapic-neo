"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { applyViewerReaction, type ViewerReactionTarget } from "@/lib/reactions/optimistic";
import type { ReactionUser } from "@/lib/reactions/types";
import { ReactionEmojiView } from "./ReactionEmojiView";
import {
  emitReaction,
  subscribeReaction,
  toSnapshot,
  type ReactionSnapshot,
} from "./reactionSync";

/**
 * リアクションの状態と操作（設定・付け替え・取り消し）をまとめて扱う client フック。
 *
 * 画像詳細ではリアクションの入口が複数ある（モバイルのフローティングバーの＋ボタン・
 * チップ末尾の＋・チップのポップオーバー内）。それぞれが同じ操作ロジックを持つと重複するため1本に集約する。
 * 各インスタンスは自分の snapshot を持ち、成功時に reactionSync 経由で兄弟へ配って同期する
 * （source of truth は各ローカル state のまま。詳細は reactionSync.ts）。
 *
 * 表示は楽観更新（applyViewerReaction）で押した瞬間に差し替え、APIレスポンスが返ったら確定値へ
 * 置き換える。書き込みは Fediverse 送信＋オーナー側キャッシュ同期を伴い数秒かかることがあり、
 * 応答を待って描くと押しても無反応に見えるため。失敗したら最後の確定値へ巻き戻す。
 */
export function useReactionActions(
  imageId: string,
  initialSnapshot: ReactionSnapshot,
  /** 楽観更新でリアクション一覧へ差し込む閲覧者自身。未ログインは null（操作もできない） */
  viewer: ReactionUser | null
) {
  const [snapshot, setSnapshotState] = useState<ReactionSnapshot>(initialSnapshot);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const confirm = useConfirm();

  // 表示中の状態（楽観更新を含む）。同一フレームでの連続操作でも最新から積み上げるため ref で持つ。
  const snapshotRef = useRef(initialSnapshot);
  // サーバーが最後に返した確定状態。送信に失敗したときの巻き戻し先。
  const confirmedRef = useRef(initialSnapshot);
  // 送信待ちの意図（最後の1つだけ保持＝途中の操作は送らずに畳む）。null は「無し」。
  const pendingRef = useRef<{ target: ViewerReactionTarget | null } | null>(null);
  const runningRef = useRef(false);

  const show = useCallback(
    (
      next: ReactionSnapshot,
      options: { confirmed?: boolean; broadcast?: boolean } = {}
    ) => {
      snapshotRef.current = next;
      if (options.confirmed) confirmedRef.current = next;
      setSnapshotState(next);
      // 受信側は emit しない（echo防止）。配るのは自分が変更した側だけ。
      if (options.broadcast) emitReaction(imageId, next);
    },
    [imageId]
  );

  // 他インスタンス（別の＋ボタン等）の操作結果を受信
  useEffect(
    () => subscribeReaction(imageId, (next) => show(next, { confirmed: true })),
    [imageId, show]
  );

  /** 最新状態（GET結果）を反映する。送信中は楽観表示を古い値で上書きしないよう捨てる。 */
  const syncSnapshot = useCallback(
    (next: ReactionSnapshot) => {
      if (runningRef.current || pendingRef.current) return;
      show(next, { confirmed: true, broadcast: true });
    },
    [show]
  );

  /** 同期エラー等の注記だけを差し替える（件数・チップには触らない）。 */
  const setStatusMessage = useCallback(
    (message: string | null) => {
      show({ ...snapshotRef.current, statusMessage: message });
    },
    [show]
  );

  /** 1件送る。成功なら確定値を取り込んで true。 */
  const send = useCallback(
    async (target: ViewerReactionTarget | null): Promise<boolean> => {
      try {
        const response = await fetch(`/api/v1/images/${imageId}/reactions`, {
          method: target === null ? "DELETE" : "PUT",
          ...(target === null
            ? {}
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emoji: target.emoji }),
              }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message = body?.error?.message ?? "リアクションに失敗しました";
          const suggestion = body?.error?.suggestion;
          setErrorMessage(suggestion ? `${message}（${suggestion}）` : message);
          return false;
        }
        const next = toSnapshot(await response.json());
        confirmedRef.current = next;
        // 後続の意図が積まれている間に確定値を描くと、直前の楽観表示が一瞬前の状態へ戻って
        // ちらつく。まだ送るものがあるときは楽観表示のままにして、最後の確定値だけを描く。
        if (!pendingRef.current) show(next, { confirmed: true, broadcast: true });
        return true;
      } catch {
        setErrorMessage("リアクション中にエラーが発生しました");
        return false;
      }
    },
    [imageId, show]
  );

  /** 溜まった意図を1件ずつ直列に送る（Fediverseへの二重送信を避けるため並行させない）。 */
  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsLoading(true);
    try {
      let pending = pendingRef.current;
      while (pending) {
        pendingRef.current = null;
        if (!(await send(pending.target))) {
          // 失敗。どこまで相手サーバーに届いたか分からない状態で追撃はせず、確定値へ戻す。
          pendingRef.current = null;
          show(confirmedRef.current, { broadcast: true });
          break;
        }
        pending = pendingRef.current;
      }
    } finally {
      runningRef.current = false;
      setIsLoading(false);
    }
  }, [send, show]);

  const submit = useCallback(
    (target: ViewerReactionTarget | null) => {
      if (!viewer) return;
      setErrorMessage(null);
      const current = snapshotRef.current;
      show(
        {
          ...applyViewerReaction(current, viewer, target),
          statusMessage: current.statusMessage,
        },
        { broadcast: true }
      );
      pendingRef.current = { target };
      void drain();
    },
    [viewer, show, drain]
  );

  const viewerEmoji = snapshot.viewerEmoji;

  const handlePick = useCallback(
    (emoji: string, imageUrl: string | null = null) => {
      // 既に付いている絵文字をもう一度選んだら解除（Misskey と同じ操作感）。
      // 判定は state ではなく ref から読む。この関数はピッカー（絵文字が数千個）へ渡るので、
      // リアクションのたびに identity が変わると閉じる直前のピッカーが丸ごと再レンダーされ、
      // そのフレーム＝押した瞬間の応答（INP）に乗ってしまうため。
      submit(emoji === snapshotRef.current.viewerEmoji ? null : { emoji, imageUrl });
    },
    [submit]
  );

  const removeWithConfirm = useCallback(async () => {
    // 呼び出し元（＋ボタン・自分のチップ）はリアクション済みのときしか出さないので実質通らない。
    // 以降で絵文字を描画するための型の絞り込みを兼ねる。
    if (!viewerEmoji) return;
    // 取り消す対象がどれかを本文に出す。カスタム絵文字は画像で見せたいので文字列ではなく
    // ReactionEmojiView を埋める（description は ReactNode を受け取れる）。
    const imageUrl =
      snapshot.chips.find((chip) => chip.emoji === viewerEmoji)?.imageUrl ?? null;
    const ok = await confirm({
      title: "リアクションを取り消す",
      description: (
        // pitfall: 絵文字は1文字として文中に流すだけにし、レイアウトを足さないこと。
        // - flex にすると地の文まで1アイテム扱いになり、途中で折れず絵文字の直後で丸ごと改行される
        // - align-middle や text-[18px] を足すと、画像（h-[1.3em]）が本文 text-sm より大きくなって
        //   ベースラインからはみ出し、行の高さが膨らむ
        // ただしカスタム絵文字は横長のものがあり、素のまま流すと画像の直後で折り返して
        // 「（画像）／を取り消します。」と分かれてしまう。述語だけは絵文字と同じ行に残したいので、
        // そこだけ whitespace-nowrap で括って改行を禁じる（「よろしいですか？」は溢れたら折り返す）。
        // JSX は要素前後の改行＋インデントを削るので、絵文字の右の空きは mr-1 で作る。
        <>
          <span className="whitespace-nowrap">
            <ReactionEmojiView
              emoji={viewerEmoji}
              imageUrl={imageUrl}
              className="mr-1"
            />
            を取り消します。
          </span>
          よろしいですか？
        </>
      ),
      confirmText: "取り消す",
      destructive: true,
    });
    if (ok) submit(null);
  }, [confirm, submit, viewerEmoji, snapshot.chips]);

  return {
    snapshot,
    syncSnapshot,
    setStatusMessage,
    isLoading,
    errorMessage,
    viewerEmoji,
    submit,
    handlePick,
    removeWithConfirm,
  };
}
