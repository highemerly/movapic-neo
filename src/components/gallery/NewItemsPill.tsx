"use client";

import { ArrowUp } from "lucide-react";

/**
 * 「N件の新着」ピル。先頭から離れてスクロール中に更新で新着が積まれたときだけ上部に出す。
 * タップで先頭へスムーズスクロールし、件数をリセットする。count<=0 なら何も描画しない。
 *
 * PTR は先頭で行うため主に自動更新（再前面化）でスクロール中に効く導線。件数の管理は
 * useInfiniteImages（newCount / clearNewCount）が持つ。
 */
export function NewItemsPill({
  count,
  onTap,
}: {
  count: number;
  onTap: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
      style={{ marginTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <button
        type="button"
        onClick={onTap}
        className="pill-in pointer-events-auto flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-lg active:scale-95 transition-transform"
      >
        <ArrowUp className="h-4 w-4" />
        {count}件の新着
      </button>
    </div>
  );
}
