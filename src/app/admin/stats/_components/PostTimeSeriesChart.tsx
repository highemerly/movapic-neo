/**
 * 投稿数の時系列グラフ（サーバーレンダのインライン SVG・チャートライブラリ非導入）。
 *
 * 単一Y軸（どちらも「件数」）:
 *   - 折れ線 = 総投稿数（全 source）
 *   - 積み上げ棒 = お気に入り同期状態（直近200 / 未同期 / エラー＝補集合）。favoritable な投稿のみ
 * status パレット（緑/琥珀/赤）＋凡例＋ネイティブ <title> ツールチップで色のみに依存させない。
 */

import type { TimeBucket } from "@/lib/admin/timeseries";

// viewBox 座標（レスポンシブは width:100% + viewBox に委ねる）
const W = 720;
const H = 260;
const PAD = { top: 14, right: 14, bottom: 30, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BASE_Y = PAD.top + PLOT_H;

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function PostTimeSeriesChart({ data }: { data: TimeBucket[] }) {
  const n = data.length;
  if (n === 0) {
    return (
      <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        データがありません。
      </p>
    );
  }

  const rawMax = Math.max(1, ...data.map((d) => d.posts));
  const yMax = niceMax(rawMax);
  const band = PLOT_W / n;
  const barW = Math.max(2, Math.min(band * 0.62, 28));
  const xCenter = (i: number) => PAD.left + band * (i + 0.5);
  const yOf = (v: number) => BASE_Y - (v / yMax) * PLOT_H;

  // x ラベルの間引き（詰まりすぎ防止）
  const labelStep = Math.max(1, Math.ceil(n / 12));

  // 折れ線パス
  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${xCenter(i).toFixed(1)},${yOf(d.posts).toFixed(1)}`)
    .join(" ");

  // 水平グリッド（0/.25/.5/.75/1）
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="投稿数とお気に入り同期状態の時系列グラフ"
      >
        {/* グリッド＋Y軸ラベル */}
        {gridVals.map((v) => {
          const y = yOf(v);
          return (
            <g key={v}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {v.toLocaleString("ja-JP")}
              </text>
            </g>
          );
        })}

        {/* 積み上げ棒（下から: 直近200 → 未同期 → エラー） */}
        {data.map((d, i) => {
          const cx = xCenter(i);
          const x = cx - barW / 2;
          const segs = [
            { key: "ok", v: d.ok, cls: "fill-emerald-500", label: "直近200" },
            { key: "unsynced", v: d.unsynced, cls: "fill-amber-500", label: "未同期" },
            { key: "err", v: d.err, cls: "fill-red-500", label: "エラー" },
          ];
          let acc = 0;
          return (
            <g key={i}>
              {segs.map((s) => {
                if (s.v <= 0) return null;
                const h = (s.v / yMax) * PLOT_H;
                const yTop = BASE_Y - (acc / yMax) * PLOT_H - h;
                acc += s.v;
                // 2px のサーフェスギャップ（セグメント間の視認性）
                const drawH = Math.max(1, h - 1);
                return (
                  <rect
                    key={s.key}
                    x={x}
                    y={yTop}
                    width={barW}
                    height={drawH}
                    rx={1.5}
                    className={s.cls}
                  >
                    <title>{`${d.fullLabel} ・ ${s.label} ${s.v.toLocaleString("ja-JP")} 件`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}

        {/* 折れ線（総投稿数） */}
        <path
          d={linePath}
          fill="none"
          className="stroke-foreground"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 点（少数バケット時のみ・ツールチップの当たり判定も兼ねる） */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xCenter(i)}
            cy={yOf(d.posts)}
            r={n <= 14 ? 3 : 2.5}
            className="fill-foreground"
          >
            <title>{`${d.fullLabel} ・ 総投稿 ${d.posts.toLocaleString("ja-JP")} 件`}</title>
          </circle>
        ))}

        {/* X軸ラベル（間引き） */}
        {data.map((d, i) =>
          i % labelStep === 0 ? (
            <text
              key={i}
              x={xCenter(i)}
              y={BASE_Y + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>

      {/* 凡例 */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendItem className="bg-foreground" shape="line" label="総投稿数" />
        <LegendItem className="bg-emerald-500" label="直近200" />
        <LegendItem className="bg-amber-500" label="未同期" />
        <LegendItem className="bg-red-500" label="エラー" />
      </div>
    </div>
  );
}

function LegendItem({
  className,
  label,
  shape = "square",
}: {
  className: string;
  label: string;
  shape?: "square" | "line";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block ${className} ${
          shape === "line" ? "h-0.5 w-4 rounded" : "h-3 w-3 rounded-sm"
        }`}
      />
      {label}
    </span>
  );
}
