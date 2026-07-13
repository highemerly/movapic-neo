import Link from "@/components/Link";

/** 直近期間の増減。value の符号で矢印・色を決め、text で表示（バイト等の整形済み文字列も可）。 */
export interface StatDelta {
  /** 純増減の数値（符号のみ利用）。0=横ばい */
  value: number;
  /** 表示テキスト（例 "+12" / "-3.2 MB"）。符号込みで渡す */
  text: string;
}

function DeltaBadge({ delta }: { delta: StatDelta }) {
  const arrow = delta.value > 0 ? "↑" : delta.value < 0 ? "↓" : "±";
  return (
    <span
      className="absolute right-3 top-3 flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground"
      title="直近7日間の増減"
    >
      <span aria-hidden>{arrow}</span>
      {delta.text}
    </span>
  );
}

/**
 * ラベル＋数値のメトリクスカード。href を渡すとカード全体がリンクになる
 * （ダッシュボードから各詳細ページへの導線用）。delta を渡すと右上に増減を小さく表示。
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  href,
  delta,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "warn" | "danger";
  href?: string;
  delta?: StatDelta;
}) {
  const valueColor =
    tone === "danger" && value !== 0
      ? "text-red-600"
      : tone === "warn" && value !== 0
        ? "text-amber-600"
        : "";
  const body = (
    <>
      {delta && <DeltaBadge delta={delta} />}
      {/* delta バッジと重ならないよう、ラベルの右側に余白を確保 */}
      <span className="pr-12 text-xs text-muted-foreground">{label}</span>
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
        className="relative flex flex-col gap-0.5 rounded-lg border border-border p-3 transition-colors hover:border-foreground/30 hover:bg-muted/40"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="relative flex flex-col gap-0.5 rounded-lg border border-border p-3">
      {body}
    </div>
  );
}
