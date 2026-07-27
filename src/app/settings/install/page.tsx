import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import { IosInstallSteps } from "@/components/pwa/IosInstallSteps";

export const dynamic = "force-dynamic";

/**
 * iOS Safari 向けの「ホーム画面に追加」手順ページ。
 * 設定「アカウント・セキュリティ」の控えめなインストール導線（InstallEntry）から遷移してくる。
 */
export default async function InstallGuidePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  return (
    <>
      <SiteHeader
        user={{
          username: user.username,
          instanceDomain: user.instance.domain,
          avatarUrl: getAvatarUrl(user.avatarUrl),
        }}
      />
      <PageContainer>
        <BackLink href="/settings">設定</BackLink>

        <h1 className="text-lg font-semibold mb-2">ホーム画面に追加する</h1>
        <p className="text-muted-foreground mb-6">
          SHAMEZOをアプリのように利用しましょう！iPhone・iPad では、 Safari で次のとおり操作してみてください。
        </p>

        <IosInstallSteps />

        <p className="text-xs text-muted-foreground mt-6">
          ※ iOS Chrome など Safari 以外のブラウザは非対応です。
        </p>

        <Footer />
      </PageContainer>
    </>
  );
}
