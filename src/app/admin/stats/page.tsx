/**
 * 管理ページ: 統計情報（/admin/stats）
 *
 * 管理者（ADMIN_ACCTS）のみ閲覧可。非管理者には 404 を返す。
 * お気に入り sync の健康状態・graphile-worker のジョブ状況・サービス全体統計を表示する。
 * 数値の可視化のみで操作系は持たない（読み取り専用）。
 */

import { notFound } from "next/navigation";

import Link from "@/components/Link";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import {
  getFavoriteSyncStats,
  getQueueStats,
  getServiceStats,
  type QueueStats,
  type FavServerWindow,
} from "@/lib/adminStats";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";

export const dynamic = "force-dynamic";

const JST = { timeZone: "Asia/Tokyo" } as const;
function fmt(d: Date | null): string {
  return d ? d.toLocaleString("ja-JP", JST) : "—";
}

/** サーバー種別のロゴ（Mastodon=紫 / Misskey=緑）。ホバーで種別名を出す。 */
function InstanceLogo({ type }: { type: string }) {
  const misskey = type === "misskey";
  return (
    <span
      title={misskey ? "Misskey" : "Mastodon"}
      className="inline-flex align-middle"
    >
      {misskey ? (
        <MisskeyIcon className="h-4 w-4 text-[#86b300]" />
      ) : (
        <MastodonIcon className="h-4 w-4 text-[#6364ff]" />
      )}
    </span>
  );
}

/** ラベル＋数値のカード */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "warn" | "danger";
}) {
  const valueColor =
    tone === "danger" && value !== 0
      ? "text-red-600"
      : tone === "warn" && value !== 0
        ? "text-amber-600"
        : "";
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {typeof value === "number" ? value.toLocaleString("ja-JP") : value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

const FAV_WINDOWS: { key: FavServerWindow; label: string }[] = [
  { key: "all", label: "全期間" },
  { key: "1d", label: "1日" },
  { key: "7d", label: "7日" },
];

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ favWindow?: string }>;
}) {
  const currentUser = await getCurrentUser();
  const acct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  if (!isAdmin(acct)) {
    notFound();
  }

  const sp = await searchParams;
  const favWindow: FavServerWindow =
    sp.favWindow === "1d" || sp.favWindow === "7d" ? sp.favWindow : "all";

  // queue は graphile_worker スキーマ依存で失敗し得るため個別に握る（他セクションは出す）。
  const [fav, service, queue] = await Promise.all([
    getFavoriteSyncStats(favWindow),
    getServiceStats(),
    getQueueStats().catch(
      (): QueueStats => ({
        available: false,
        tasks: [],
        failures: [],
        crontabs: [],
      })
    ),
  ]);

  const sourceLabel: Record<string, string> = {
    web: "🌐 Web",
    email: "📧 メール",
    mention: "🤖 Bot",
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">統計情報</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        管理者向けのサービス状況。読み取り専用（リロードで最新化）。
      </p>

      {/* ── サービス全体 ── */}
      <section className="mb-10">
        <h2 className="mb-3 text-xl font-bold">サービス全体</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="ユーザー数" value={service.userCount} />
          <Stat
            label="総投稿数"
            value={service.imageCount}
            hint={`うち公開TL ${service.publicCount.toLocaleString("ja-JP")}`}
          />
          <Stat label="直近24時間の投稿" value={service.last24h} />
          <Stat label="直近7日の投稿" value={service.last7d} />
          <Stat
            label="未対応の通報"
            value={service.openReports}
            tone="warn"
          />
          <Stat label="非表示中の投稿" value={service.disabledImages} tone="warn" />
        </div>
        <div className="mt-3">
          <span className="text-xs font-semibold text-muted-foreground">
            投稿ソース別
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {service.bySource.map((s) => (
              <span
                key={s.source}
                className="rounded-full border border-border px-3 py-1 text-sm tabular-nums"
              >
                {sourceLabel[s.source] ?? s.source}{" "}
                <span className="font-bold">{s.count.toLocaleString("ja-JP")}</span>
              </span>
            ))}
          </div>
        </div>

        {/* サーバー別 */}
        <div className="mt-4">
          <span className="text-xs font-semibold text-muted-foreground">
            サーバー別（全 {service.instanceCount.toLocaleString("ja-JP")}{" "}
            サーバー・ユーザー数の多い順）
          </span>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-right text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 text-left font-semibold" colSpan={2}>
                    サーバー
                  </th>
                  <th className="py-1.5 pr-3 font-semibold">ユーザー</th>
                  <th className="py-1.5 pr-3 font-semibold">総投稿</th>
                  <th className="py-1.5 pr-3 font-semibold">7日投稿</th>
                  <th className="py-1.5 font-semibold">7日新規</th>
                </tr>
              </thead>
              <tbody className="text-right tabular-nums">
                {service.byInstance.map((inst) => (
                  <tr key={inst.domain} className="border-b border-border/50">
                    <td className="w-6 py-1 pr-2">
                      <InstanceLogo type={inst.type} />
                    </td>
                    <td className="break-all py-1 pr-3 text-left font-mono">
                      {inst.domain}
                    </td>
                    <td className="py-1 pr-3 font-medium">
                      {inst.users.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-1 pr-3">{inst.posts.toLocaleString("ja-JP")}</td>
                    <td className="py-1 pr-3">{inst.posts7d.toLocaleString("ja-JP")}</td>
                    <td className="py-1">{inst.newUsers7d.toLocaleString("ja-JP")}</td>
                  </tr>
                ))}
                {service.otherInstances > 0 && (
                  <tr className="text-muted-foreground">
                    <td className="py-1 pr-2" />
                    <td className="py-1 pr-3 text-left">
                      他 {service.otherInstances.toLocaleString("ja-JP")} サーバー
                    </td>
                    <td className="py-1 pr-3">
                      {service.other.users.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-1 pr-3">
                      {service.other.posts.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-1 pr-3">
                      {service.other.posts7d.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-1">
                      {service.other.newUsers7d.toLocaleString("ja-JP")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── お気に入り sync ── */}
      <section className="mb-10">
        <h2 className="mb-1 text-xl font-bold">お気に入り同期</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Fediverse 投稿{" "}
          {fav.favoritable.toLocaleString("ja-JP")} 件が対象（local は除外）。
        </p>

        {/* サマリ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="対象投稿数" value={fav.favoritable} hint="全期間" />
          <Stat label="未同期" value={fav.neverSynced} tone="warn" hint="一度も同期なし" />
          <Stat label="総お気に入り数" value={fav.totalFavorites} />
          <Stat
            label="⏳ 取りこぼし backlog"
            value={fav.backlog}
            tone="warn"
            hint="定期syncの対象数"
          />
          <Stat
            label="成功率"
            value={`${fav.favoritable ? Math.round((fav.ok / fav.favoritable) * 100) : 0}%`}
            hint="全期間の最新200割合"
          />
        </div>

        {/* 同期アクティビティ（期間別・同期基準） */}
        <h3 className="mt-6 mb-1 text-sm font-bold">同期アクティビティ（期間別）</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          各行はその期間に<span className="font-semibold">最後の同期</span>が記録された画像数
          （favorites_synced_at）とステータス内訳。全期間は各投稿の最新ステータスの総計。
          横計＝同期数。1画像は最新1回ぶんのみ計上（同期回数ではなくユニーク画像数）。未同期は上のサマリ参照。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 text-left font-semibold">期間</th>
                <th className="py-1.5 pr-3 font-semibold">同期</th>
                <th className="py-1.5 pr-3 font-semibold">200</th>
                <th className="py-1.5 pr-3 font-semibold">429</th>
                <th className="py-1.5 pr-3 font-semibold">4xx</th>
                <th className="py-1.5 pr-3 font-semibold">5xx</th>
                <th className="py-1.5 font-semibold">接続失敗</th>
              </tr>
            </thead>
            <tbody className="text-right tabular-nums">
              {[
                { label: "直近1時間", total: false, w: fav.window1h },
                { label: "直近24時間", total: false, w: fav.window24h },
                {
                  label: "全期間",
                  total: true,
                  w: {
                    synced:
                      fav.ok +
                      fav.rateLimited +
                      fav.clientError +
                      fav.serverError +
                      fav.connError,
                    ok: fav.ok,
                    rateLimited: fav.rateLimited,
                    clientError: fav.clientError,
                    serverError: fav.serverError,
                    connError: fav.connError,
                  },
                },
              ].map(({ label, total, w }) => (
                <tr
                  key={label}
                  className={
                    total ? "border-t-2 border-border" : "border-b border-border/50"
                  }
                >
                  <td className="py-1.5 pr-3 text-left font-medium">{label}</td>
                  <td className="py-1.5 pr-3">{w.synced}</td>
                  <td className="py-1.5 pr-3">{w.ok}</td>
                  <td className={`py-1.5 pr-3 ${w.rateLimited ? "text-amber-600" : ""}`}>
                    {w.rateLimited}
                  </td>
                  <td className={`py-1.5 pr-3 ${w.clientError ? "text-amber-600" : ""}`}>
                    {w.clientError}
                  </td>
                  <td className={`py-1.5 pr-3 ${w.serverError ? "font-bold text-red-600" : ""}`}>
                    {w.serverError}
                  </td>
                  <td className={`py-1.5 ${w.connError ? "font-bold text-red-600" : ""}`}>
                    {w.connError}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* サーバー別 */}
        <div className="mt-6 mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">サーバー（投稿者インスタンス）別</h3>
          <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
            {FAV_WINDOWS.map((w) => (
              <Link
                key={w.key}
                href={w.key === "all" ? "?" : `?favWindow=${w.key}`}
                scroll={false}
                className={
                  favWindow === w.key
                    ? "bg-foreground px-2.5 py-1 font-semibold text-background"
                    : "px-2.5 py-1 text-muted-foreground hover:bg-muted"
                }
              >
                {w.label}
              </Link>
            ))}
          </div>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          同期先はオーナーのインスタンス。最終同期が新しい順・上位 {fav.byServer.length} 件。
          {favWindow === "all"
            ? "（全期間・各投稿の最新ステータス）"
            : `（直近${favWindow === "1d" ? "1日" : "7日"}に最後の同期が記録された投稿のみ）`}
        </p>
        {fav.byServer.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            対象の投稿がありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-right text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 text-left font-semibold">サーバー</th>
                  <th className="py-1.5 pr-3 font-semibold">対象</th>
                  <th className="py-1.5 pr-3 font-semibold">成功</th>
                  <th
                    className="py-1.5 pr-3 font-semibold"
                    title="429 / 5xx / 接続失敗（定期リトライ継続）"
                  >
                    一時失敗
                  </th>
                  <th
                    className="py-1.5 pr-3 font-semibold"
                    title="429以外の4xx（deleted/forbidden 等・定期リトライ停止）"
                  >
                    4xx
                  </th>
                  {favWindow === "all" && (
                    <th className="py-1.5 pr-3 font-semibold">未同期</th>
                  )}
                  <th className="py-1.5 font-semibold">最終同期</th>
                </tr>
              </thead>
              <tbody className="text-right tabular-nums">
                {fav.byServer.map((s) => (
                  <tr key={s.domain} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-left">
                      <span className="inline-flex items-center gap-1.5">
                        <InstanceLogo type={s.type} />
                        <span className="break-all font-mono">{s.domain}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{s.favoritable}</td>
                    <td className="py-1.5 pr-3">{s.ok}</td>
                    <td className={`py-1.5 pr-3 ${s.tempFail ? "font-bold text-red-600" : ""}`}>
                      {s.tempFail}
                    </td>
                    <td className={`py-1.5 pr-3 ${s.clientFail ? "font-bold text-amber-600" : ""}`}>
                      {s.clientFail}
                    </td>
                    {favWindow === "all" && (
                      <td className={`py-1.5 pr-3 ${s.neverSynced ? "text-amber-600" : ""}`}>
                        {s.neverSynced}
                      </td>
                    )}
                    <td className="py-1.5 text-muted-foreground">{fmt(s.lastSynced)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── ジョブキュー（graphile-worker） ── */}
      <section className="mb-4">
        <h2 className="mb-1 text-xl font-bold">定期ジョブ / キュー</h2>
        {!queue.available ? (
          <p className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            graphile_worker スキーマにアクセスできません（worker-front が未起動、
            または接続に権限がありません）。
          </p>
        ) : (
          <>
            {/* crontab（定期スケジュール）の最終実行 */}
            {queue.crontabs.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-sm text-muted-foreground">
                  定期スケジュール（30分間隔で <code>periodic</code> を enqueue）
                </p>
                <ul className="flex flex-col gap-1">
                  {queue.crontabs.map((c) => (
                    <li
                      key={c.identifier}
                      className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-mono">{c.identifier}</span>
                      <span className="text-muted-foreground">
                        最終実行 {fmt(c.lastExecution)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* タスク別のジョブ件数 */}
            <p className="mb-1.5 text-sm text-muted-foreground">
              キュー中のジョブ（タスク別）
            </p>
            {queue.tasks.length === 0 ? (
              <p className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                キューは空です（未処理ジョブなし）。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-3 font-semibold">タスク</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">総数</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">実行中</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">再試行待ち</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">失敗確定</th>
                      <th className="py-1.5 text-right font-semibold">次回実行</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.tasks.map((t) => (
                      <tr key={t.taskIdentifier} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-mono">{t.taskIdentifier}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{t.total}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{t.running}</td>
                        <td
                          className={`py-1.5 pr-3 text-right tabular-nums ${t.retrying ? "text-amber-600" : ""}`}
                        >
                          {t.retrying}
                        </td>
                        <td
                          className={`py-1.5 pr-3 text-right tabular-nums ${t.dead ? "font-bold text-red-600" : ""}`}
                        >
                          {t.dead}
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          {fmt(t.nextRun)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 直近の失敗（last_error 付き） */}
            {queue.failures.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-sm text-muted-foreground">
                  エラーのあるジョブ（最新 {queue.failures.length} 件）
                </p>
                <ul className="flex flex-col gap-2">
                  {queue.failures.map((f, i) => (
                    <li
                      key={`${f.taskIdentifier}-${i}`}
                      className="rounded border border-border p-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{f.taskIdentifier}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            f.attempts >= f.maxAttempts
                              ? "bg-red-500/15 text-red-600"
                              : "bg-amber-500/15 text-amber-600"
                          }`}
                        >
                          {f.attempts}/{f.maxAttempts} 回
                        </span>
                        <span className="text-xs text-muted-foreground">
                          次回 {fmt(f.runAt)}
                        </span>
                      </div>
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {f.lastError}
                      </pre>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
