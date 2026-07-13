/**
 * 管理ページ: 統計ダッシュボード（/admin/stats）
 *
 * 管理者ガードは admin/layout.tsx に集約。ここは「主要メトリクス＋時系列グラフ」だけを出す
 * 軽量ダッシュボード。各メトリクスは詳細ページ（accounts / servers / favorites / reports）や
 * 公開TL（/public）への導線。読み取り専用（リロードで最新化）。
 */

import { getMainMetrics } from "@/lib/admin/metrics";
import { getPostTimeSeries, getUserTimeSeries } from "@/lib/admin/timeseries";
import { getComponentHealth } from "@/lib/admin/health";
import { normalizePeriod, periodRangeText, PERIOD_OPTIONS, type Period } from "@/lib/admin/periods";
import { StatCard } from "../_components/StatCard";
import { fmtBytes } from "../_components/ui";
import { PeriodSelect } from "../_components/PeriodSelect";
import { normalizeParams } from "../_components/query";
import { PostTimeSeriesChart } from "./_components/PostTimeSeriesChart";
import { UserTimeSeriesChart } from "./_components/UserTimeSeriesChart";
import { HealthPanel } from "./_components/HealthPanel";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  web: "Web",
  mention: "Bot",
  email: "Mail",
};

/** 期間ごとのバケット粒度（getPostTimeSeries と一致）を説明文に使う。 */
function granularityLabel(p: Period): string {
  if (p === "all") return "月次";
  if (p === "1h" || p === "24h" || p === "72h" || p === "yesterday") return "時次";
  return "日次";
}

/** 直近7日間の増減（数値カウント）を StatCard の delta 形式に整形。 */
function countDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return { value: n, text: `${sign}${Math.abs(n).toLocaleString("ja-JP")}` };
}

/** 直近7日間の増減（バイト）を StatCard の delta 形式に整形。 */
function bytesDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return { value: n, text: `${sign}${fmtBytes(Math.abs(n))}` };
}

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = normalizeParams(await searchParams);
  const period = normalizePeriod(params.range, "7d");

  const [metrics, series, userSeries, health] = await Promise.all([
    getMainMetrics(),
    getPostTimeSeries(period),
    getUserTimeSeries(period),
    getComponentHealth(),
  ]);

  const sourceHint = metrics.bySource
    .map((s) => `${SOURCE_LABEL[s.source] ?? s.source} ${s.count.toLocaleString("ja-JP")}`)
    .join(" / ");

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">統計情報</h1>
      {/* 主要メトリクス */}
      <h2 className="text-xl font-bold mt-6 mb-3">主要メトリクス</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="総ユーザー数"
          value={metrics.userCount}
          delta={countDelta(metrics.deltas7d.userCount)}
          href="/admin/accounts"
        />
        <StatCard
          label="ユニークサーバー数"
          value={metrics.serverCount}
          delta={countDelta(metrics.deltas7d.serverCount)}
          href="/admin/servers"
        />
        <StatCard
          label="総投稿数"
          value={metrics.imageCount}
          hint={sourceHint || undefined}
          delta={countDelta(metrics.deltas7d.imageCount)}
          href="/public"
        />
        <StatCard
          label="ストレージ利用量（概算）"
          value={fmtBytes(metrics.storageApproxBytes)}
          delta={bytesDelta(metrics.deltas7d.storageApproxBytes)}
          href="/admin/system"
        />
        <StatCard
          label="未対応の通報"
          value={metrics.openReports}
          tone="warn"
          delta={countDelta(metrics.deltas7d.openReports)}
          href="/admin/reports"
        />
        <StatCard
          label="未同期のお気に入り"
          value={metrics.favUnsynced}
          tone="warn"
          href="/admin/favorites"
        />
      </div>

      {/* コンポーネント稼働状況（ヘルスチェック） */}
      <div className="mt-10">
        <HealthPanel items={health} />
      </div>

      {/* 時系列グラフ */}
      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">投稿数</h2>
          <PeriodSelect
            basePath="/admin/stats"
            params={params}
            param="range"
            current={period}
            options={PERIOD_OPTIONS}
            rangeText={`${periodRangeText(period, new Date())}・${granularityLabel(period)}`}
          />
        </div>
        <PostTimeSeriesChart data={series} />
      </section>

      {/* 新規ユーザー登録数（上の期間セレクタと同じ range を共有） */}
      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">新規ユーザー数</h2>
          <span className="text-xs text-muted-foreground">
            初回ログイン基準・{periodRangeText(period, new Date())}・{granularityLabel(period)}
          </span>
        </div>
        <UserTimeSeriesChart data={userSeries} />
      </section>
    </>
  );
}
