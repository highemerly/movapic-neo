import Link from "@/components/Link";

/**
 * ラベル＋数値のメトリクスカード。href を渡すとカード全体がリンクになる
 * （ダッシュボードから各詳細ページへの導線用）。
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "warn" | "danger";
  href?: string;
}) {
  const valueColor =
    tone === "danger" && value !== 0
      ? "text-red-600"
      : tone === "warn" && value !== 0
        ? "text-amber-600"
        : "";
  const body = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {typeof value === "number" ? value.toLocaleString("ja-JP") : value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex flex-col gap-0.5 rounded-lg border border-border p-3 transition-colors hover:border-foreground/30 hover:bg-muted/40"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
      {body}
    </div>
  );
}
