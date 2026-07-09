/**
 * 横棒の内訳リスト（サーバーレンダ・インライン。チャートライブラリ非導入方針）。
 * トラック全幅 = 100%（total 基準）。バー長も右端の % も total に対する割合
 * （構成比 or 取得率）で一致させる。
 */

export interface BarRow {
  key: string;
  label: string;
  count: number;
  /** ラベル左のスウォッチ（色オプション・ランク色など。CSS カラー） */
  swatch?: string;
}

export function BarList({
  rows,
  total,
  emptyText = "対象なし",
}: {
  rows: BarRow[];
  /** % の分母（構成比なら合計、取得率ならユーザー数） */
  total: number;
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        // トラック全幅を 100%（total 基準）とし、バー長＝表示 % を一致させる。
        const ratio = total ? r.count / total : 0;
        const pct = Math.round(ratio * 100);
        // 0件でない限り最低 2% は見せる（極小の割合でも棒が消えないように）。
        const width = r.count > 0 ? Math.max(2, ratio * 100) : 0;
        return (
          <li key={r.key} className="text-sm">
            <div className="mb-1 flex items-center gap-1.5">
              {r.swatch && (
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm border border-border"
                  style={{ backgroundColor: r.swatch }}
                />
              )}
              <span className="text-muted-foreground">{r.label}</span>
              <span className="ml-auto font-medium tabular-nums">
                {r.count.toLocaleString("ja-JP")}
              </span>
              <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                {pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${width.toFixed(1)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
