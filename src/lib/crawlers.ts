import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import prisma from "@/lib/db";
import { parseUserHandle, userPathSegment } from "@/lib/userHandle";

/**
 * クロール拒否（User.blockCrawlers）まわりの共通ロジック。
 *
 * 設計:
 * - 検索エンジン（Googlebot 等）は robots.txt では止めず、ページ単位の noindex メタ
 *   （各 /u/[username] 系ページの generateMetadata）で制御する。robots.txt で Disallow
 *   してしまうと noindex メタを読めず、URLだけが検索結果に残るため。
 * - AI/LLM 系クローラーは per-page メタを尊重しないものが多いので robots.txt の
 *   User-agent 別 Disallow で止める（こちらが主役）。
 * - 即時反映は不要なので結果は unstable_cache で 1 時間キャッシュし、設定変更時のみ
 *   revalidateTag(ROBOTS_BLOCKLIST_TAG) で破棄する（= トグル操作で即時反映）。
 */

/** robots.txt のブロックリストキャッシュのタグ。設定変更時にこのタグをrevalidateする。 */
export const ROBOTS_BLOCKLIST_TAG = "robots-blocklist";

/**
 * robots.txt で Disallow 対象にする AI/LLM クローラーの User-agent。
 * 検索インデックス用クローラー（Googlebot/Bingbot 等）は含めない。
 */
export const AI_CRAWLER_USER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Claude-SearchBot",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "Meta-ExternalAgent",
  "FacebookBot",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "YouBot",
  "Timpibot",
];

/**
 * クロール拒否を選んだユーザーの robots.txt Disallow パス一覧を返す。
 * 各ユーザーにつき 2 エントリ:
 * - `/u/<seg>$` … プロフィールページ自身（`$` で前方一致の誤爆 = alice/alice2 を防ぐ）
 * - `/u/<seg>/` … status / calendar / map などの配下すべて
 *
 * 1 時間キャッシュ（revalidate）＋ ROBOTS_BLOCKLIST_TAG タグで設定変更時に即時破棄。
 * 検証用に ROBOTS_DISABLE_CACHE=1 のときはキャッシュを完全バイパスして毎回DBを引く。
 */
const fetchCrawlerBlockedPaths = async () => {
  const users = await prisma.user.findMany({
    where: { blockCrawlers: true },
    select: { username: true, instance: { select: { domain: true } } },
  });
  return users.flatMap((u) => {
    const seg = userPathSegment(u.username, u.instance.domain);
    return [`/u/${seg}$`, `/u/${seg}/`];
  });
};

export const getCrawlerBlockedPaths = process.env.ROBOTS_DISABLE_CACHE
  ? fetchCrawlerBlockedPaths
  : unstable_cache(fetchCrawlerBlockedPaths, [ROBOTS_BLOCKLIST_TAG], {
      revalidate: 3600,
      tags: [ROBOTS_BLOCKLIST_TAG],
    });

/**
 * `/u/[username]` セグメントのユーザーがクロール拒否中かを返す。
 * React cache で同一リクエスト内の重複クエリを1回に畳む（generateMetadata 用の軽量クエリ）。
 */
const isUserCrawlerBlocked = cache(async (handleSegment: string): Promise<boolean> => {
  const { username, domain } = parseUserHandle(handleSegment);
  const user = await prisma.user.findFirst({
    where: { username, instance: { domain } },
    select: { blockCrawlers: true },
  });
  return user?.blockCrawlers ?? false;
});

/**
 * `/u/[username]` 系ページの generateMetadata 用。クロール拒否ユーザーなら検索エンジンに
 * noindex を返す（AI Bot は robots.txt 側で制御）。それ以外は空メタ（既定挙動を維持）。
 */
export async function userPageRobotsMetadata(handleSegment: string): Promise<Metadata> {
  return (await isUserCrawlerBlocked(handleSegment))
    ? { robots: { index: false, follow: false } }
    : {};
}
