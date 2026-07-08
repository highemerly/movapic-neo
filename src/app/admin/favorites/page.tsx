/**
 * 管理ページ: お気に入り同期状況（/admin/favorites）
 *
 * 管理者ガードは admin/layout.tsx に集約。
 * 画面構成: 期間切替 → サマリー(期間フィルタ) → サーバー別テーブル(先頭に「すべて」行・行クリックで絞り込み)
 * → 円グラフ2枚(期間＋選択サーバーで絞り込み) → エラー投稿サンプル。
 * サマリー・サーバー別は server 非依存（期間のみ）。円グラフとエラーサンプルだけ選択サーバーで絞る。
 */

import Link from "@/components/Link";

import { userPathSegment } from "@/lib/userHandle";
import { getFavoritesData } from "@/lib/admin/favorites";
import { normalizePeriod, periodRangeText, PERIOD_OPTIONS } from "@/lib/admin/periods";
import { StatCard } from "../_components/StatCard";
import { InstanceLogo } from "../_components/InstanceLogo";
import { PeriodSelect } from "../_components/PeriodSelect";
import { Pagination } from "../_components/Pagination";
import { DonutChart, type DonutSegment } from "../_components/DonutChart";
import { TableWrap, theadRowCls, fmt, EmptyBox } from "../_components/ui";
import { normalizeParams, parsePage, withParams } from "../_components/query";

export const dynamic = "force-dynamic";

const BASE = "/admin/favorites";

// ステータスの表示メタ（円グラフの塗り・凡例で共有）。fill/bg は Tailwind が拾えるリテラル。
// ラベルは表示上 "Other 4xx"→"4xx"、"接続失敗"→"0"。
const STATUS_META = [
  { key: "unsynced", label: "未同期", fill: "fill-slate-400", bg: "bg-slate-400" },
  { key: "ok", label: "200", fill: "fill-emerald-500", bg: "bg-emerald-500" },
  { key: "forbidden", label: "403", fill: "fill-red-500", bg: "bg-red-500" },
  { key: "notFound", label: "404", fill: "fill-rose-400", bg: "bg-rose-400" },
  { key: "rateLimited", label: "429", fill: "fill-amber-400", bg: "bg-amber-400" },
  { key: "otherClient", label: "4xx", fill: "fill-red-800", bg: "bg-red-800" },
  { key: "serverError", label: "5xx", fill: "fill-orange-500", bg: "bg-orange-500" },
  { key: "connError", label: "0", fill: "fill-yellow-500", bg: "bg-yellow-500" },
  { key: "other", label: "その他", fill: "fill-slate-300", bg: "bg-slate-300" },
] as const;

const STATUS_ONLY = STATUS_META.filter((m) => m.key !== "unsynced");

/** breakdown を DonutSegment[] にし、多い順（value 降順）に並べる。0 は末尾。 */
function segments(
  meta: readonly { key: string; label: string; fill: string; bg: string }[],
  data: Record<string, number>
): DonutSegment[] {
  return meta
    .map((m) => ({ key: m.key, label: m.label, fill: m.fill, bg: m.bg, value: data[m.key] ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

/** エラー投稿の post_status を短いラベルに */
function statusLabel(s: number | null): string {
  if (s === 0) return "0（接続失敗）";
  if (s === null) return "不明";
  return String(s);
}

export default async function AdminFavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = normalizeParams(await searchParams);
  const period = normalizePeriod(params.window, "24h");
  const server = params.server?.trim() || null;
  const serverPage = parsePage(params.page);
  const { summary, posted, synced, byServer, serverTotals, serverCount, serverTotalPages, errorSamples } =
    await getFavoritesData(period, server, serverPage);

  const postedSegs = segments(STATUS_META, posted as unknown as Record<string, number>);
  const syncedSegs = segments(STATUS_ONLY, synced as unknown as Record<string, number>);

  // 「すべて」行＝全サーバー合算（ページ非依存）。
  const total = {
    favoritable: serverTotals.favoritable,
    ok: serverTotals.ok,
    temp: serverTotals.rateLimited + serverTotals.serverError + serverTotals.connError,
    client: serverTotals.forbidden + serverTotals.notFound + serverTotals.otherClient,
    last: serverTotals.lastSynced,
  };

  const numCls = (n: number, cls: string) =>
    `py-1.5 pr-3 ${n ? cls : "text-muted-foreground/50"}`;

  // 選択行の見た目（太い左罫線＋前景色の淡い背景）。「すべて」行・サーバー行で共用。
  const rowCls = (active: boolean) =>
    `border-b border-border/50 ${active ? "bg-foreground/10" : "hover:bg-muted/40"}`;
  const firstCellCls = (active: boolean) =>
    `py-1.5 pr-3 text-left border-l-4 ${active ? "border-foreground" : "border-transparent"}`;

  // 円グラフ・エラーサンプルはサーバーで絞り込まれる。絞り込み中はその旨を右揃えで明記。
  const serverNote = server ? (
    <span className="text-[11px] text-muted-foreground">絞り込み: {server}</span>
  ) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">お気に入り同期</h1>
        <PeriodSelect
          basePath={BASE}
          params={params}
          param="window"
          current={period}
          options={PERIOD_OPTIONS}
          rangeText={periodRangeText(period, new Date())}
        />
      </div>

      {/* サマリー（期間フィルタ） */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="対象投稿数" value={summary.favoritable} />
        <StatCard label="未同期" value={summary.neverSynced} tone="warn" />
        <StatCard label="総お気に入り数" value={summary.totalFavorites} />
        <StatCard label="⏳ backlog" value={summary.backlog} tone="warn" />
        <StatCard label="成功率" value={`${summary.successRate}%`} />
      </div>

      {/* サーバー別（先頭に「すべて」行・行クリックで円グラフを絞り込み・ページネーション） */}
      <section className="mt-8">
        <h2 className="mb-1 text-lg font-bold">
          同期サーバー
        </h2>
        <TableWrap minWidth="34rem">
          <thead>
            <tr className={theadRowCls}>
              <th className="py-1.5 pr-3 text-left font-semibold">サーバー名</th>
              <th className="py-1.5 pr-3 font-semibold">対象</th>
              <th className="py-1.5 pr-3 font-semibold">成功</th>
              <th className="py-1.5 pr-3 font-semibold">エラー(一時)</th>
              <th className="py-1.5 pr-3 font-semibold">エラー(4xx)</th>
              <th className="py-1.5 font-semibold">最終同期</th>
            </tr>
          </thead>
          <tbody className="text-right tabular-nums">
            {/* すべて行 */}
            <tr className={rowCls(!server)}>
              <td className={firstCellCls(!server)}>
                <Link
                  href={withParams(BASE, params, { server: undefined })}
                  scroll={false}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <span className={!server ? "font-semibold text-foreground" : "font-medium"}>
                    すべて
                  </span>
                </Link>
              </td>
              <td className="py-1.5 pr-3 font-medium">
                {total.favoritable.toLocaleString("ja-JP")}
              </td>
              <td className="py-1.5 pr-3 text-emerald-600">
                {total.ok.toLocaleString("ja-JP")}
              </td>
              <td className={numCls(total.temp, "font-bold text-red-600")}>
                {total.temp.toLocaleString("ja-JP")}
              </td>
              <td className={numCls(total.client, "font-bold text-amber-600")}>
                {total.client.toLocaleString("ja-JP")}
              </td>
              <td className="py-1.5 text-muted-foreground">{fmt(total.last)}</td>
            </tr>

            {byServer.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  対象の投稿がありません。
                </td>
              </tr>
            ) : (
              byServer.map((s) => {
                const tempError = s.rateLimited + s.serverError + s.connError;
                const clientErr = s.forbidden + s.notFound + s.otherClient;
                const active = s.domain === server;
                return (
                  <tr key={s.domain} className={rowCls(active)}>
                    <td className={firstCellCls(active)}>
                      <Link
                        href={withParams(BASE, params, { server: s.domain })}
                        scroll={false}
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        <InstanceLogo type={s.type} />
                        <span className={`break-all font-mono ${active ? "font-semibold text-foreground" : ""}`}>
                          {s.domain}
                        </span>
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 font-medium">
                      {s.favoritable.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-1.5 pr-3 text-emerald-600">
                      {s.ok.toLocaleString("ja-JP")}
                    </td>
                    <td className={numCls(tempError, "font-bold text-red-600")}>
                      {tempError.toLocaleString("ja-JP")}
                    </td>
                    <td className={numCls(clientErr, "font-bold text-amber-600")}>
                      {clientErr.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{fmt(s.lastSynced)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableWrap>
        <Pagination
          basePath={BASE}
          params={params}
          page={serverPage}
          totalPages={serverTotalPages}
          totalCount={serverCount}
        />
      </section>

      {/* 円グラフ2枚（期間＋選択サーバーで絞り込み） */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">同期ステータス</h2>
          {serverNote}
        </div>
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-bold">投稿タイミング基準</h3>
            <DonutChart segments={postedSegs} centerLabel="対象投稿" />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-bold">同期タイミング基準</h3>
            <DonutChart segments={syncedSegs} centerLabel="同期数" />
          </div>
        </div>
      </section>

      {/* エラー投稿サンプル（投稿詳細へ飛べる） */}
      <section className="mt-8">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">エラー投稿（サンプル）</h2>
          {serverNote}
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          最新順・最大12件。
        </p>
        {errorSamples.length === 0 ? (
          <EmptyBox>該当するエラー投稿はありません。</EmptyBox>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {errorSamples.map((e) => {
              const seg = userPathSegment(e.username, e.domain);
              return (
                <li key={e.id}>
                  <Link
                    href={`/u/${seg}/status/${e.id}`}
                    target="_blank"
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-600 tabular-nums">
                      {statusLabel(e.postStatus)}
                    </span>
                    <InstanceLogo type={e.instanceType} />
                    <span className="min-w-0 flex-1 truncate">
                      {e.overlayText || "(本文なし)"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmt(e.syncedAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
