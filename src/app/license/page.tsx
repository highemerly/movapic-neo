import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { FontLicenseCard } from "@/components/fonts/FontLicenseCard";
import { FONT_LICENSE_LIST } from "@/lib/fonts/licenses";

export default async function LicensePage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">フォントライセンス</h2>
          <p className="text-sm text-muted-foreground mb-4">
            本サービスでは以下のフォントを使用しています。
          </p>
          <div className="space-y-4">
            {FONT_LICENSE_LIST.map((license) => (
              <FontLicenseCard key={license.key} license={license} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            本サービスではフォントを画像の生成にのみ使用しており、フォントファイル自体の配布は行っていません。
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            フォント見本の文章には、宮沢賢治『ポラーノの広場』からの引用を含みます。
          </p>
        </section>

        <Footer />
      </div>
    </>
  );
}
