"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ユーザーページのタブ並び順。左右どちら向きにスライドするかの判定に使う。
const TAB_ORDER = ["home", "photos", "calendar", "map", "achievements"] as const;
type TabKey = (typeof TAB_ORDER)[number];

const STORAGE_KEY = "movapic_user_tab";

// サーバーでは useLayoutEffect が警告を出すため、クライアントのみ layout effect を使う
// （ペイント前に方向を確定してスライドを走らせたいので useEffect では遅い）。
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * ユーザーページのタブ本文を「横スライド」で入れ替えるラッパー。
 *
 * タブは別ルートなので、直前に見ていたタブを sessionStorage に記録し、
 * 並び順で右側のタブへ＝右から、左側のタブへ＝左から、にゅーっと入場させる。
 *
 * SSR/初回ロード時は方向不明（dir=null）でアニメ無し → ハイドレーション不一致を避ける。
 * クライアント側のタブ切替（SPA 遷移）でのみ、マウント直後の useLayoutEffect で
 * 方向を確定し、ペイント前に slide クラスを適用してアニメを走らせる。
 */
export function TabTransition({
  tab,
  children,
}: {
  tab: TabKey;
  children: React.ReactNode;
}) {
  const [dir, setDir] = useState<"left" | "right" | null>(null);

  useIsomorphicLayoutEffect(() => {
    let prev: string | null = null;
    try {
      prev = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.setItem(STORAGE_KEY, tab);
    } catch {
      // sessionStorage 不可（プライベートモード等）ならアニメ無しで継続
    }
    if (prev && prev !== tab) {
      const pi = TAB_ORDER.indexOf(prev as TabKey);
      const ci = TAB_ORDER.indexOf(tab);
      if (pi !== -1 && ci !== -1) {
        setDir(ci > pi ? "right" : "left");
      }
    }
  }, [tab]);

  return (
    <div
      className={cn(
        dir &&
          "animate-in fade-in duration-300 ease-out " +
            (dir === "right"
              ? "slide-in-from-right-10"
              : "slide-in-from-left-10"),
      )}
    >
      {children}
    </div>
  );
}
