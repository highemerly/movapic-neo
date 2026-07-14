/**
 * 統計ページ（/stats）: サービス全体の公開統計。
 * - 各投稿オプションの利用傾向（公開投稿を groupBy で集計）
 * - 実績の取得状況（key ごとの保有ユーザー数と取得率）
 *
 * 認証は任意（ヘッダー表示にのみ利用）。集計は publicStats に集約。
 */

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { BarList } from "./_components/BarList";
import { getCachedStats } from "@/lib/stats/publicStats";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "統計",
  description: "SHAMEZO の投稿オプションの利用傾向と実績の取得状況の統計。",
  // クロール対象にしない（Bot による重い集計アクセスの増幅を避ける）。
  robots: { index: false, follow: false },
};

// 実績ランクのスウォッチ色（金/銀）
const RANK_SWATCH: Record<string, string> = {
  gold: "#f59e0b",
  silver: "#94a3b8",
};

export default async function StatsPage() {
  const [currentUser, stats] = await Promise.all([
    getCurrentUser(),
    getCachedStats(),
  ]);
  const { optionStats, postingStats, distributionStats, achievementStats } =
    stats;

  return (
    <>
      <SiteHeader
        user={
          currentUser
            ? {
                username: currentUser.username,
                instanceDomain: currentUser.instance.domain,
                avatarUrl: getAvatarUrl(currentUser.avatarUrl),
              }
            : null
        }
      />
      <PageContainer width="6xl">
        <BackLink href="/docs">ドキュメントへ</BackLink>
        {/* 投稿オプションの利用傾向 */}
        <section className="mt-4">
          <h2 className="mb-1 text-xl font-bold">文字合成オプションの利用傾向</h2>
          <p className="mb-4 text-xs text-muted-foreground">
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {optionStats.map((b) => (
              <div key={b.title} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-bold">{b.title}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {b.total.toLocaleString("ja-JP")} 件
                  </span>
                </div>
                <BarList rows={b.items} total={b.total} />
              </div>
            ))}
          </div>
        </section>

        {/* 投稿ソースと Fediverse 連携 */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold">投稿ソースとFediverse連携</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {postingStats.map((b) => (
              <div key={b.title} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-bold">{b.title}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {b.total.toLocaleString("ja-JP")} 件
                  </span>
                </div>
                <BarList rows={b.items} total={b.total} />
              </div>
            ))}
          </div>
        </section>

        {/* ユーザーの分布（実際の数値でバケット分け） */}
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-bold">ユーザー分布</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {distributionStats.map((b) => (
              <div key={b.title} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-bold">{b.title}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {b.total.toLocaleString("ja-JP")} 人
                  </span>
                </div>
                <BarList rows={b.items} total={b.total} emptyText="データなし" />
              </div>
            ))}
          </div>
        </section>

        {/* 実績の取得状況 */}
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-bold">実績の取得状況</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {achievementStats.sections.map((s) => (
              <div key={s.title} className="rounded-lg border border-border p-4">
                <h3 className="mb-3 font-bold">{s.title}</h3>
                <BarList
                  rows={s.rows.map((r) => ({
                    key: r.key,
                    label: r.title,
                    count: r.holders,
                    swatch: RANK_SWATCH[r.rank],
                  }))}
                  total={achievementStats.totalUsers}
                />
              </div>
            ))}
          </div>
        </section>

        <Footer />
      </PageContainer>
    </>
  );
}
