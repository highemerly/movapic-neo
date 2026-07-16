"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export interface FlashToast {
  variant: "success" | "warning" | "error" | "info";
  message: string;
  description?: string;
  /** description に付けるクラス（改行を見せる whitespace-pre-line など）。 */
  descriptionClassName?: string;
  /** ミリ秒。Infinity で自動消滅しない（ユーザーが閉じるまで残す）。省略時は sonner 既定。 */
  duration?: number;
}

/** FlashToast を sonner で発火する。遷移後フラッシュ・その場トーストの両方で共有する。 */
export function showFlashToast(flash: FlashToast) {
  toast[flash.variant](flash.message, {
    description: flash.description,
    descriptionClassName: flash.descriptionClassName,
    duration: flash.duration,
  });
}

/**
 * ページ遷移後に一度だけ sonner トーストを発火するフラッシュ用コンポーネント。
 * 「操作 → 遷移 → 遷移先で表示」というフロー（投稿完了・削除完了など）では
 * クライアントの sonner を直接呼べないため、サーバーコンポーネントがクエリパラメータから
 * 表示内容（FlashToast）を決めてこのコンポーネントに渡す。
 * 発火後は該当クエリパラメータを URL から取り除き、リロードで再表示されないようにする。
 */
export function ToastFlasher({
  flash,
  clearParams = [],
}: {
  flash: FlashToast;
  clearParams?: string[];
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    showFlashToast(flash);

    if (clearParams.length > 0) {
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of clearParams) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) {
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
      }
    }
  }, [flash, clearParams]);

  return null;
}
