/**
 * /admin/stats の先頭に出すコンポーネント・ヘルスチェック表示（サーバーコンポーネント）。
 * 状態ごとに色分けしたドット＋一行サマリ＋詳細（key-value）。リロードで最新化。
 */

import type { ComponentHealth, HealthState } from "@/lib/admin/health";

const STATE_STYLE: Record<HealthState, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-600", label: "正常" },
  warn: { dot: "bg-amber-500", text: "text-amber-600", label: "注意" },
  down: { dot: "bg-red-500", text: "text-red-600", label: "異常" },
  unknown: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "確認不可" },
};

function HealthRow({ c }: { c: ComponentHealth }) {
  const s = STATE_STYLE[c.state];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
        <span className="font-medium">{c.label}</span>
        <span className={`ml-auto shrink-0 text-xs font-semibold ${s.text}`}>{s.label}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>
      {c.meta.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {c.meta.map((m) => (
            <div key={m.label} className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-muted-foreground/70">{m.label}</dt>
              <dd className="font-mono tabular-nums break-all">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function HealthPanel({ items }: { items: ComponentHealth[] }) {
  const worst = items.some((c) => c.state === "down")
    ? "down"
    : items.some((c) => c.state === "warn")
      ? "warn"
      : items.some((c) => c.state === "unknown")
        ? "unknown"
        : "ok";
  const overall = STATE_STYLE[worst];

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xl font-bold">コンポーネント稼働状況</h2>
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${overall.text}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${overall.dot}`} aria-hidden />
          {worst === "ok" ? "すべて正常" : overall.label}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((c) => (
          <HealthRow key={c.key} c={c} />
        ))}
      </div>
    </section>
  );
}
