import type { ReactNode } from "react";

/**
 * 一覧が空のときの共通プレースホルダー表示。
 * action を渡すと文言の下にCTA（ボタン等）を表示する。
 */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <p>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
