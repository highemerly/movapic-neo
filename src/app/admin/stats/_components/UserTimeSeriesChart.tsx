/**
 * 新規ユーザー登録数の時系列グラフ（サーバーレンダのインライン SVG・ライブラリ非導入）。
 *
 * 単一Y軸「登録数」の折れ線のみ（初回ログイン=User.created_at 基準）。
 * 投稿数グラフ（PostTimeSeriesChart）と同一の座標系・グリッド・軸ラベルで揃える。
 */

import type { UserTimeBucket } from "@/lib/admin/timeseries";

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

export function UserTimeSeriesChart({ data }: { data: UserTimeBucket[] }) {
  const n = data.length;
  if (n === 0) {
    return (
      <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        データがありません。
      </p>
    );
  }

  const rawMax = Math.max(1, ...data.map((d) => d.users));
  const yMax = niceMax(rawMax);
  const band = PLOT_W / n;
  const xCenter = (i: number) => PAD.left + band * (i + 0.5);
  const yOf = (v: number) => BASE_Y - (v / yMax) * PLOT_H;

  // x ラベルの間引き（詰まりすぎ防止）
  const labelStep = Math.max(1, Math.ceil(n / 12));

  // 折れ線パス
  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${xCenter(i).toFixed(1)},${yOf(d.users).toFixed(1)}`)
    .join(" ");

  // 水平グリッド（0/.25/.5/.75/1）
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="新規ユーザー登録数の時系列グラフ"
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

        {/* 折れ線（新規ユーザー数） */}
        <path
          d={linePath}
          fill="none"
          className="stroke-sky-500"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 点（ツールチップの当たり判定も兼ねる） */}
        {data.map((d, i) => (
          <circle key={i} cx={xCenter(i)} cy={yOf(d.users)} r={n <= 14 ? 3 : 2.5} className="fill-sky-500">
            <title>{`${d.fullLabel} ・ 新規ユーザー ${d.users.toLocaleString("ja-JP")} 人`}</title>
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
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-sky-500" />
          新規ユーザー数
        </span>
      </div>
    </div>
  );
}
