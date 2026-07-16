import type { LucideIcon } from "lucide-react";

/**
 * 実績タブの大見出し（「次のステップ」「実績コレクション」など最上位の節）。
 * カテゴリ小見出し（デビュー等）と明確に段差が付くよう、アイコンをamberの角丸バッジに入れる。
 */
export function SectionTitle({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  /** 見出し右端に置く補助要素（任意）。 */
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-[15px] font-bold">{title}</h2>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
