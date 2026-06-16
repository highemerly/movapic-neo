import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "利用規約",
  description: "SHAMEZOの利用規約",
};

export default async function TermsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">利用規約</h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              SHAMEZO（以下「本サービス」）をご利用いただくにあたり、本サービスを利用する全ての方（以下「ユーザー」）は、以下の利用規約に同意したうえでご利用ください。本サービスの運営者を以下「管理者」といいます。
            </p>

            <div className="rounded-lg border-2 border-primary bg-primary/5 p-5 shadow-sm">
              <p className="flex items-center gap-2 text-base font-bold text-primary mb-3">
                特に重要なルール
              </p>
              <ul className="list-disc list-inside text-sm text-foreground space-y-2 font-medium">
                <li>みんなで楽しく使いましょう。</li>
                <li>他の誰かが撮影または作成したものではなく、自分が権利をもつ画像のみを投稿しましょう。</li>
                <li>法令・公序良俗・道徳に反する投稿はやめましょう。</li>
                <li>意図的にサーバーに負荷をかける行為はやめましょう。</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">禁止される投稿</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
                <li>法令または公序良俗に違反する投稿</li>
                <li>犯罪行為または犯罪行為の疑いのある投稿</li>
                <li>自殺・自傷行為・薬物乱用・犯罪への加担（いわゆる闇バイトへの募集を含みます。）など、反社会的な内容を含む投稿</li>
                <li>反社会的勢力に対して直接または間接に利益を供与する投稿</li>
                <li>過度に暴力的または性的な投稿（児童ポルノの投稿を含みます。）</li>
                <li>青少年の健全な育成に悪影響を与える可能性のある投稿</li>
                <li>自らが権利を有しない画像の投稿、管理者または他のユーザーまたは第三者の知的財産権・肖像権・プライバシー・名誉その他の権利または利益を侵害する投稿</li>
                <li>管理者または他のユーザーまたは第三者への嫌がらせを目的とした投稿</li>
                <li>人種・国籍・信条・性別・社会的身分・門地等による差別を目的とした投稿</li>
                <li>その他、管理者が不適切と判断する投稿</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">禁止される行為</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
                <li>意図的にサーバーに過度な負荷をかける行為</li>
                <li>不正アクセスやクローリング・スクレイピング等の行為（データがほしい方は管理者に相談してください）</li>
                <li>その他、管理者が不適切と判断する行為</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">免責事項</p>
              <p className="text-sm text-muted-foreground">
                本サービスは現状有姿（AS-IS）で提供されます。管理者は、サービスの継続性・可用性・法律上の瑕疵がないことを、明示的にも暗黙的にも保証しません。また、ユーザーの投稿内容については、投稿したユーザー本人が責任を負うものとします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">利用制限</p>
              <p className="text-sm text-muted-foreground">
                利用規約に逸脱した利用が認められる場合、管理者は事前の通知なく投稿の削除やアカウントの停止など必要な処置をとることがあります。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">未成年の利用</p>
              <p className="text-sm text-muted-foreground">
                未成年の方が本サービスを利用する場合、保護者の同意を得たものとみなします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">著作権</p>
              <p className="text-sm text-muted-foreground">
                ユーザーが本サービスを利用して投稿した内容は、当該ユーザーその他既存の権利者に留保されるものとします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">個人情報の扱い</p>
              <p className="text-sm text-muted-foreground">
                本サービスの利用によって取得する個人情報は、別途定める
                <a
                  href="/privacy"
                  className="text-primary hover:underline"
                >
                  プライバシーポリシー
                </a>
                に従い適切に取り扱うものとします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">利用規約の変更</p>
              <p className="text-sm text-muted-foreground">
                利用規約は予告なく変更されることがあります。重要な変更がある場合は、サービス上でお知らせします。変更後も本サービスを利用継続している場合、変更後の利用規約に同意したものと見なします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">準拠法</p>
              <p className="text-sm text-muted-foreground">
                本規約の解釈にあたっては、日本法を準拠法とします。本規約に関する紛争については、管理者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
              </p>
            </div>

            <p className="text-xs text-muted-foreground text-center">最終更新日：2026年6月16日</p>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
