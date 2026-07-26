/**
 * カスタム絵文字一覧（/docs/emojis）: SHAMEZO 独自カスタム絵文字の公開カタログ。
 *
 * Mastodon ユーザーがリアクションで使える絵文字は管理者登録制で、ピッカーを開かないと
 * 何があるか分からない。ログイン前でも見られる一覧として公開する（認証はヘッダー表示のみ）。
 * ピッカーと同じ listShamezoEmojis を使うため、無効化した絵文字はここにも出ない。
 */

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import {
  groupShamezoEmojisByCategory,
  listShamezoEmojis,
} from "@/lib/reactions/customEmoji";
import { EmojiCatalog } from "./_components/EmojiCatalog";

// 管理者の登録・無効化を待たせずに反映する（DBアクセス自体は listShamezoEmojis の
// プロセス内メモ化（60秒）で抑える）。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "カスタム絵文字",
  description:
    "SHAMEZO のリアクションで使える独自カスタム絵文字の一覧。Mastodon サーバーのユーザー向け。",
  // 絵文字は入れ替わりがあり検索結果に載せる価値がないため、検索エンジンには載せない
  // （AI/LLM クローラーは per-page メタを見ないので robots.txt 側で Disallow する）。
  robots: { index: false, follow: false },
};

export default async function DocsEmojisPage() {
  const [user, emojis] = await Promise.all([getCurrentUser(), listShamezoEmojis()]);
  const sections = groupShamezoEmojisByCategory(emojis);

  return (
    <>
      <SiteHeader
        user={
          user
            ? {
                username: user.username,
                instanceDomain: user.instance.domain,
                avatarUrl: getAvatarUrl(user.avatarUrl),
              }
            : null
        }
      />
      <PageContainer width="6xl">
        <BackLink href="/docs">ドキュメントへ</BackLink>

        <div className="mb-4 flex items-baseline gap-2">
          <h1 className="text-lg font-semibold">カスタム絵文字</h1>
          <span className="text-xs tabular-nums text-muted-foreground">
            {emojis.length} 件
          </span>
        </div>

        <div className="mb-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <p>
            SHAMEZO
            独自のカスタム絵文字です。Mastodonサーバーのユーザーが、投稿へのリアクションに使えます（Misskeyサーバーのユーザーは、ご自身のサーバーのカスタム絵文字が使えます）。絵文字を押すと、エイリアス（検索用の別名）とライセンスを表示します。
          </p>
          <p className="mt-2 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground/80">
            Mastodonは連合上「お気に入り」しか送れないため、どの絵文字を選んでもFediverseサーバーへはお気に入りとして伝わり、リアクションした絵文字はSHAMEZO上にのみ残ります。
          </p>
        </div>

        {sections.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            まだ登録された絵文字はありません。
          </p>
        ) : (
          <EmojiCatalog sections={sections} />
        )}

        <Footer />
      </PageContainer>
    </>
  );
}
