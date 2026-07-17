import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { getBotAcct } from "@/lib/postMethods";
import { getBotStreamStatus } from "@/lib/mention/streamStatus";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import { MentionGuide } from "@/components/post-methods/MentionGuide";
import { BotStreamStatusCard } from "@/components/post-methods/BotStreamStatusCard";

export const metadata: Metadata = {
  title: "Fediverseから投稿（Bot）",
  description: "Botへのメンションで画像を投稿する方法",
};

// メンション受信の稼働状況を毎リクエスト最新化する（getBotStreamStatus は in-process / HTTP で取得）。
export const dynamic = "force-dynamic";

export default async function CreateBotPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fcreate%2Fbot");
  }

  const isMisskey = user.instance.type === "misskey";
  const BrandIcon = isMisskey ? MisskeyIcon : MastodonIcon;
  const brandName = isMisskey ? "Misskey" : "Mastodon";

  // Bot 投稿が未提供（env 未設定）の環境ではこのページ自体を出さない
  const botAcct = getBotAcct();
  if (!botAcct) notFound();
  const status = await getBotStreamStatus();

  return (
    <>
      <SiteHeader
        user={{ username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) }}
      />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <BrandIcon className="h-5 w-5" />
            <h1 className="text-lg font-semibold">{brandName}から投稿（Bot）</h1>
          </div>

          <div className="bg-muted rounded-lg p-4">
            <MentionGuide
              botAcct={botAcct}
              userInstanceDomain={user.instance.domain}
              userInstanceType={user.instance.type}
            />
          </div>

          {/* メンション受信の稼働状況（正常/異常）はページ最下部に表示 */}
          <div className="mt-4">
            <BotStreamStatusCard status={status} />
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
