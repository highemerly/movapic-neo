"use client";

import { Check, Loader2 } from "lucide-react";

export type SaveStatusState = "idle" | "saving" | "saved" | "error";

/**
 * 自動保存フォーム共通の保存ステータス表示（保存中 / 保存しました / エラー）。
 * idle と、error だが error メッセージが無い場合は何も描画しない。
 */
export function SaveStatus({
  state,
  error,
}: {
  state: SaveStatusState;
  error?: string | null;
}) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        保存中...
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 text-xs font-normal text-green-600">
        <Check className="h-3 w-3" />
        保存しました
      </span>
    );
  }
  if (state === "error" && error) {
    return <span className="text-xs font-normal text-destructive">{error}</span>;
  }
  return null;
}
