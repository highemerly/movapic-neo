import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "利用規約",
  description: "SHAMEZOの利用規約",
};

export default async function TermsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">利用規約</h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              SHAMEZO（以下「本サービス」）をご利用いただくにあたり、以下のルールをお守りください。
            </p>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">ルール</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
                <li>みんなで楽しく使いましょう。</li>
                <li>法または道徳に反する投稿はやめてください。</li>
                <li>悪意を持ってサーバーに負荷をかける行為はやめてください。</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">免責事項</p>
              <p className="text-sm text-muted-foreground">
                本サービスは現状有姿で提供されます。サービスの継続性・可用性を保証するものではありません。また、ユーザーの投稿内容については、投稿したユーザー本人が責任を負うものとします。
              </p>
            </div>

            <p className="text-xs text-muted-foreground text-center">最終更新日：2026年3月31日</p>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
