import type { MetadataRoute } from "next";
import { AI_CRAWLER_USER_AGENTS, getCrawlerBlockedPaths } from "@/lib/crawlers";

// クロール拒否ユーザーは設定で随時変わる。robots本体は常に最新（キャッシュ済み）の
// ブロックリストを読みたいので force-dynamic。DBアクセス自体は getCrawlerBlockedPaths の
// unstable_cache（1時間 + 設定変更時revalidate）で抑える。
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const blocked = await getCrawlerBlockedPaths();

  // 統計ページは重い集計を伴うのでクロール対象外にする（ページ側 noindex と揃える）。
  const STATS_PATH = "/stats";
  // カスタム絵文字一覧は noindex。検索エンジンには `*` で Disallow せず noindex メタを
  // 読ませる（Disallow するとメタを読めず URL だけ検索結果に残る。crawlers.ts 参照）が、
  // メタを尊重しない AI Bot 群は robots.txt 側で止める。
  const EMOJIS_PATH = "/docs/emojis";

  // 既定は全許可（統計だけ Disallow）。AI Bot は専用UAグループがあると `*` ルールを
  // 見ないため、/stats はそちらのグループにも明示的に含める。
  const rules: MetadataRoute.Robots["rules"] = [
    { userAgent: "*", allow: "/", disallow: STATS_PATH },
    {
      userAgent: AI_CRAWLER_USER_AGENTS,
      disallow: [STATS_PATH, EMOJIS_PATH, ...blocked],
    },
  ];

  return { rules };
}
