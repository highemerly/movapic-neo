import { redirect } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { DeleteAccountConfirm } from "./DeleteAccountConfirm";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";

export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  return (
    <>
      <SiteHeader user={{ username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) }} />
      <PageContainer>
        <BackLink href="/settings">設定</BackLink>

        <h1 className="text-xl font-semibold mb-3 flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          アカウントを削除する
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          これまでSHAMEZOをご利用いただきましてありがとうございました。以下の説明をよく読み、同意する場合は「削除に進む」を押してください。
        </p>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-8">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive mb-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            退会（アカウント削除）に関する注意事項
          </p>
          <ul className="space-y-4 text-sm leading-relaxed">
            <li className="flex gap-2">
              <span className="select-none text-destructive">•</span>
              <span>
                <strong className="font-semibold">この操作は取り消せません。</strong>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="select-none text-destructive">•</span>
              <span>投稿した画像・実績・通知など、このサービスに記録されたすべてのデータは削除されます。お預かりしている個人情報も完全に削除されます。</span>
            </li>
            <li className="flex gap-2">
              <span className="select-none text-destructive">•</span>
              <div className="space-y-2">
                <p>削除のタイミングは以下のとおりを予定しています。</p>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="select-none">◦</span>
                    <span>Fediverse情報（認証トークン含む）、投稿したテキスト、撮影場所、ログイン履歴: ほぼ即座に削除されます。</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="select-none">◦</span>
                    <span>HTTPアクセスログ、メール受信履歴: サイバー攻撃抑止や公的機関への捜査協力の観点から一定期間保全します。およそ92日後に削除されます。</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="select-none">◦</span>
                    <span>画像: 元データはほぼ即座に削除されます。しかし、技術的制約により、画像URLに直接アクセスすると一定期間キャッシュデータが表示される場合があります。順次自然に削除されます。</span>
                  </li>
                </ul>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="select-none text-destructive">•</span>
              <span>Mastodon / Misskey などに投稿済みの元投稿は自動で削除されず、連携先のアカウントに残ります。必要に応じてご自身で削除してください。</span>
            </li>
            <li className="flex gap-2">
              <span className="select-none text-destructive">•</span>
              <span>改めてアカウント登録することで再びSHAMEZOを利用できますが、全てのデータは復元できません。</span>
            </li>
          </ul>
        </div>

        <DeleteAccountConfirm
          username={user.username}
          instanceDomain={user.instance.domain}
        />

        <Footer />
      </PageContainer>
    </>
  );
}
