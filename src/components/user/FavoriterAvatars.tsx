"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { RetryImg } from "@/components/RetryImg";

export interface FavoriterAvatarItem {
  acct: string;
  label: string;
  avatarUrl: string | null;
  profileUrl: string | null;
}

// アイコン w-5(20px) ＋ gap-1(4px)。末尾の「…」は概ね12px想定で確保する。
const AVATAR = 20;
const GAP = 4;
const ELLIPSIS_W = 12;

/**
 * お気に入りした人のアイコンを、コンテナ幅に「丸ごと入る数」だけ表示する。
 *
 * サーバー描画では収まる数が測れず overflow-hidden だとアイコンが途中で切れてしまうため、
 * マウント後に実幅を測り、はみ出す分は描かず末尾に「…」を出す。幅はカードのレイアウトで
 * 変わりうるので ResizeObserver で追従する。総数は左のハート数字が示すのでここでは出さない。
 */
export function FavoriterAvatars({ items }: { items: FavoriterAvatarItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // SSR とクライアント初回描画を一致させるため初期値は全件（マウント後に実測で絞る）。
  const [visible, setVisible] = useState(items.length);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const fullWidth = AVATAR * items.length + GAP * Math.max(0, items.length - 1);
      if (fullWidth <= cw) {
        setVisible(items.length);
        return;
      }
      // k個のアイコン＋末尾「…」が収まる最大kを求める:
      // (AVATAR+GAP)*k + ELLIPSIS_W <= cw
      const k = Math.floor((cw - ELLIPSIS_W) / (AVATAR + GAP));
      setVisible(Math.max(0, Math.min(items.length, k)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  const shown = items.slice(0, visible);
  const truncated = visible < items.length;

  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden"
    >
      {shown.map((f) => {
        const avatar = f.avatarUrl ? (
          <RetryImg
            src={f.avatarUrl}
            alt={f.label}
            className="h-5 w-5 rounded-full hover:opacity-80 transition-opacity"
          />
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground/20 text-[10px] text-muted-foreground hover:opacity-80 transition-opacity">
            {f.label.charAt(0)}
          </div>
        );
        return f.profileUrl ? (
          <a
            key={f.acct}
            href={f.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={f.label}
            className="shrink-0"
          >
            {avatar}
          </a>
        ) : (
          <span key={f.acct} title={f.label} className="shrink-0">
            {avatar}
          </span>
        );
      })}
      {truncated && (
        <span className="shrink-0 text-[11px] leading-none text-muted-foreground">…</span>
      )}
    </div>
  );
}
