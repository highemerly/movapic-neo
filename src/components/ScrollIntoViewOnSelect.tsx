"use client";

import { useEffect } from "react";

/** クリックで都道府県を選んだことを次ページ(同一ルートのソフトナビ後)へ伝えるフラグ */
export const PREF_SCROLL_FLAG = "movapic:scrollToPrefImages";

/** 都道府県タイル/パスのクリック時に呼ぶ。遷移後にスクロールさせる目印を立てる */
export function markPrefScroll() {
  try {
    sessionStorage.setItem(PREF_SCROLL_FLAG, "1");
  } catch {
    // sessionStorage 不可環境では何もしない
  }
}

/**
 * 都道府県をクリックして `?prefecture=○○` に遷移した直後、`targetId` の
 * 画像一覧見出しまでスムーズスクロールする。
 *
 * - スクロールするのは「クリックで選んだ」場合のみ（markPrefScroll でフラグが
 *   立っているとき）。?prefecture= 付きディープリンクや初期表示では動かない。
 * - ソフトナビで本コンポーネントが remount されても props 更新でも、どちらでも
 *   発火するよう `value`（選択中の都道府県）を effect 依存に入れている。
 * - 一覧は高さ0から「うにょー」と展開（約300ms）するため、伸びきって高さが
 *   確定してからスクロールする。
 */
export function ScrollIntoViewOnSelect({
  value,
  targetId,
}: {
  value: string | null;
  targetId: string;
}) {
  useEffect(() => {
    if (!value) return;

    let flagged = false;
    try {
      flagged = sessionStorage.getItem(PREF_SCROLL_FLAG) === "1";
      if (flagged) sessionStorage.removeItem(PREF_SCROLL_FLAG);
    } catch {
      // ignore
    }
    if (!flagged) return;

    // ExpandReveal の展開（duration-300）後に高さが確定してからスクロール
    const timer = setTimeout(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
    return () => clearTimeout(timer);
  }, [value, targetId]);

  return null;
}
