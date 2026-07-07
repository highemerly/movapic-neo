"use client";

import { useEffect } from "react";
import type { ComponentProps } from "react";
import Link from "@/components/Link";

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
 * `/u/[username]/map?prefecture=○○` へ飛ぶリンク。クリック時に markPrefScroll で
 * フラグを立て、遷移後に写真一覧まで自動スクロールさせる（地図タイルのクリックと同挙動）。
 * サーバーコンポーネントから使えるようクライアント側に切り出している。
 *
 * scroll={false}: 画像詳細ページ等、別ルートからの遷移だと Next が遷移時に先頭へ
 * スクロールリセットし、自動スクロールと競合して空振りする。これを切っておく。
 */
export function PrefectureScrollLink({
  onClick,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      scroll={false}
      {...props}
      onClick={(e) => {
        markPrefScroll();
        onClick?.(e);
      }}
    />
  );
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
 * - 別ルート（画像詳細）からの遷移で効かせるには、リンク側で Next の自動
 *   スクロール復元を切る（scroll={false}）こと。さもないと遷移時の先頭リセットと
 *   競合して空振りする。地図タイルは同一ルート遷移なので競合しない。
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
