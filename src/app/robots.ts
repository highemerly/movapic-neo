import type { MetadataRoute } from "next";
import { AI_CRAWLER_USER_AGENTS, getCrawlerBlockedPaths } from "@/lib/crawlers";

// クロール拒否ユーザーは設定で随時変わる。robots本体は常に最新（キャッシュ済み）の
// ブロックリストを読みたいので force-dynamic。DBアクセス自体は getCrawlerBlockedPaths の
// unstable_cache（1時間 + 設定変更時revalidate）で抑える。
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const blocked = await getCrawlerBlockedPaths();

  // 既定は全許可。クロール拒否ユーザーがいる場合のみ、AI Bot 群にだけ Disallow を追加する。
  const rules: MetadataRoute.Robots["rules"] = [{ userAgent: "*", allow: "/" }];
  if (blocked.length > 0) {
    rules.push({ userAgent: AI_CRAWLER_USER_AGENTS, disallow: blocked });
  }

  return { rules };
}
