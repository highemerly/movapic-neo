"use client";

import type React from "react";

import { cn } from "@/lib/utils";

/**
 * 管理画面の素の <select>（枠＋chevron の見た目を1箇所に集約）。
 *
 * 管理画面は選択肢が多い絞り込み（期間9種・カテゴリ可変）が中心で、等幅の
 * SegmentControl では収まらないため native select を使う。shadcn の ui/select は
 * アプリ側では使わない方針のため、ここで最小限の見た目だけ揃える。
 * サイズは className で上書きする（既定は text-sm・py-1.5）。
 */
export function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "cursor-pointer appearance-none rounded-md border border-border bg-background py-1.5 pl-2.5 pr-7 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
