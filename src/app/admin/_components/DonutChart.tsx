/**
 * ドーナツ円グラフ（サーバーレンダのインライン SVG・チャートライブラリ非導入）。
 * status 系の内訳表示用。凡例に件数と割合を出し、色のみに依存させない。
 */

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** SVG 塗り（fill-*） */
  fill: string;
  /** 凡例スウォッチ（bg-*） */
  bg: string;
}

const SIZE = 160;
const R = 70;
const INNER = 42;
const CX = SIZE / 2;
const CY = SIZE / 2;
const GAP = 0.012; // セグメント間の隙間（ラジアン）

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/** 中心角 [a0,a1] のドーナツセグメントの path（12時起点・時計回り） */
function arcPath(a0: number, a1: number): string {
  const s0 = a0 - Math.PI / 2;
  const s1 = a1 - Math.PI / 2;
  const [ox0, oy0] = polar(CX, CY, R, s0);
  const [ox1, oy1] = polar(CX, CY, R, s1);
  const [ix1, iy1] = polar(CX, CY, INNER, s1);
  const [ix0, iy0] = polar(CX, CY, INNER, s0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${ox0.toFixed(2)} ${oy0.toFixed(2)}`,
    `A ${R} ${R} 0 ${large} 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function DonutChart({
  segments,
  centerLabel,
  emptyText = "対象なし",
}: {
  segments: DonutSegment[];
  centerLabel?: string;
  emptyText?: string;
}) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((a, s) => a + s.value, 0);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label="ステータス内訳の円グラフ"
      >
        {total === 0 ? (
          <>
            <circle cx={CX} cy={CY} r={R} className="fill-muted" />
            <circle cx={CX} cy={CY} r={INNER} className="fill-background" />
            <text
              x={CX}
              y={CY + 4}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {emptyText}
            </text>
          </>
        ) : (
          <>
            {(() => {
              let acc = 0;
              return shown.map((s) => {
                const frac = s.value / total;
                const a0 = acc * 2 * Math.PI + (shown.length > 1 ? GAP : 0);
                const a1 = (acc + frac) * 2 * Math.PI;
                acc += frac;
                return (
                  <path key={s.key} d={arcPath(a0, Math.max(a1, a0 + 0.001))} className={s.fill}>
                    <title>
                      {s.label} {s.value.toLocaleString("ja-JP")} 件（
                      {Math.round(frac * 100)}%）
                    </title>
                  </path>
                );
              });
            })()}
            <text
              x={CX}
              y={CY - 2}
              textAnchor="middle"
              className="fill-foreground text-[18px] font-bold tabular-nums"
            >
              {total.toLocaleString("ja-JP")}
            </text>
            {centerLabel && (
              <text
                x={CX}
                y={CY + 13}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>

      {/* 凡例（件数＋割合） */}
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-xs sm:flex sm:flex-col sm:gap-y-0.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${s.bg}`} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums">
              {s.value.toLocaleString("ja-JP")}
            </span>
            <span className="w-9 text-right text-muted-foreground tabular-nums">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
