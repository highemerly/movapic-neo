"use client";

import { Check, RefreshCw } from "lucide-react";

/**
 * 手動 pull-to-refresh の結果を一瞬だけ伝えるピル。reconcile は差分を静かに反映するため
 * （無変化だと画面が動かない）、「何件取り込んだか／最新だったか」を明示して更新が効いた
 * ことを分かるようにする。表示・自動クローズは useInfiniteImages（refreshResult）が持つ。
 * 自動更新（再前面化）では出さない＝手動操作の確認フィードバック専用。
 *
 * count>0 → 「N件の更新」、0 → 「最新です」。null なら何も描画しない。
 */
export function RefreshResultPill({
  result,
}: {
  result: { count: number } | null;
}) {
  if (!result) return null;
  const updated = result.count > 0;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
      style={{ marginTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <div className="pill-flash flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-1.5 text-sm font-medium text-foreground shadow-lg">
        {updated ? (
          <RefreshCw className="h-4 w-4 text-primary" />
        ) : (
          <Check className="h-4 w-4 text-emerald-500" />
        )}
        {updated ? `${result.count}件の最新投稿` : "更新はありません"}
      </div>
    </div>
  );
}
