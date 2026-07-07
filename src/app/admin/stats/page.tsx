/**
 * 管理ページ: 統計ダッシュボード（/admin/stats）
 *
 * 管理者ガードは admin/layout.tsx に集約。ここは「主要メトリクス＋時系列グラフ」だけを出す
 * 軽量ダッシュボード。各メトリクスは詳細ページ（accounts / servers / favorites / reports）や
 * 公開TL（/public）への導線。読み取り専用（リロードで最新化）。
 */

import { getMainMetrics } from "@/lib/admin/metrics";
import { getPostTimeSeries, isTimeRange, type TimeRange } from "@/lib/admin/timeseries";
import { StatCard } from "../_components/StatCard";
import { PeriodToggle } from "../_components/PeriodToggle";
import { normalizeParams } from "../_components/query";
import { PostTimeSeriesChart } from "./_components/PostTimeSeriesChart";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  web: "🌐Web",
  mention: "🤖Bot",
  email: "📧メール",
};

const RANGE_OPTIONS = [
  { value: "31d", label: "31日" },
  { value: "7d", label: "7日" },
  { value: "1d", label: "1日" },
];

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = normalizeParams(await searchParams);
  const range: TimeRange = isTimeRange(params.range) ? params.range : "7d";

  const [metrics, series] = await Promise.all([
    getMainMetrics(),
    getPostTimeSeries(range),
  ]);

  const sourceHint = metrics.bySource
    .map((s) => `${SOURCE_LABEL[s.source] ?? s.source} ${s.count.toLocaleString("ja-JP")}`)
    .join(" / ");

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">統計情報</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        管理者向けのサービス状況。各カードから詳細ページへ移動できます。
      </p>

      {/* 主要メトリクス */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="総ユーザー数" value={metrics.userCount} href="/admin/accounts" />
        <StatCard
          label="ユニークサーバー数"
          value={metrics.serverCount}
          href="/admin/servers"
        />
        <StatCard
          label="総投稿数"
          value={metrics.imageCount}
          hint={sourceHint || undefined}
          href="/public"
        />
        <StatCard
          label="未対応の通報"
          value={metrics.openReports}
          tone="warn"
          href="/admin/reports"
        />
        <StatCard
          label="お気に入り未同期"
          value={metrics.favUnsynced}
          tone="warn"
          hint="一度も同期なし"
          href="/admin/favorites"
        />
      </div>

      {/* 時系列グラフ */}
      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">投稿数の推移</h2>
          <PeriodToggle
            basePath="/admin/stats"
            params={params}
            param="range"
            current={range}
            options={RANGE_OPTIONS}
          />
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          折れ線＝総投稿数、積み上げ棒＝お気に入り同期状態（favoritable な投稿のみ・JST 基準）。
          {range === "1d" ? "直近24時間を時次で表示。" : `直近${range === "31d" ? "31" : "7"}日を日次で表示。`}
        </p>
        <PostTimeSeriesChart data={series} />
      </section>
    </>
  );
}
