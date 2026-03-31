import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "SHAMEZOのプライバシーポリシー",
};

export default async function PrivacyPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">プライバシーポリシー</h2>
          <div className="space-y-4">

            <p className="text-sm text-muted-foreground">
              本サービス（以下「SHAMEZO」）は、個人情報保護法をはじめとする関連法令を遵守し、ユーザーの個人情報を適切に取り扱います。
            </p>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">収集する情報</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Fediverse（Mastodon/Misskey）にログインした際にそのサーバーから取得する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>ユーザーID</li>
                    <li>ユーザー名</li>
                    <li>表示名</li>
                    <li>プロフィール画像URL</li>
                    <li>認証トークン</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">ユーザーが入力することで取得する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>プロフィール説明</li>
                    <li>画像および追加するテキスト</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">自動的に収集される情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>IPアドレス</li>
                    <li>ログイン日時</li>
                    <li>投稿日時</li>
                    <li>ブラウザに関する情報（User-agentなど）</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">Cookieの使用</p>
              <p className="text-sm text-muted-foreground mb-3">
                本サービスでは以下の目的でCookieを使用しています。広告やトラッキング目的でのCookie使用は行っておりません。
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">セッションCookie（movapic_session）</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>目的：ログイン状態の維持</li>
                    <li>有効期限：7日間</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">OAuth認証用一時Cookie（oauth_session, oauth_state）</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>目的：Fediverse認証プロセスの保護</li>
                    <li>有効期限：10分間</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">お知らせ既読管理Cookie（ann）</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>目的：お知らせの既読状態を記憶</li>
                    <li>有効期限：30日間</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">情報の利用目的</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>画像生成・投稿サービスの提供</li>
                <li>ユーザー認証およびセッション管理</li>
                <li>Fediverseへの投稿機能の提供</li>
                <li>サービスの改善・開発</li>
                <li>不正利用防止・セキュリティ対策</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">セキュリティ対策、プライバシー保護</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>全ての通信はHTTPSで暗号化されています</li>
                <li>アップロードされた画像のEXIF情報（GPS位置情報、カメラ情報等）は自動的に削除され、元画像のメタデータは保存されません</li>
                <li>Fediverse（Mastodon/Misskey）の認証トークンなど重要な情報は暗号化して保存されます</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">外部サービスへの情報提供</p>
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Fediverse（Mastodon/Misskey）</p>
                <p className="text-sm text-muted-foreground">
                  ユーザーが投稿を選択した場合、生成した画像とテキストが連携先のFediverseサーバーに投稿されます。
                </p>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">第三者への提供</p>
              <p className="text-sm text-muted-foreground mb-2">
                ユーザーの同意なく第三者に個人情報を提供することはありません。ただし以下の場合を除きます。
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>人の生命・身体・財産の保護のために必要で、本人の同意を得ることが困難なとき</li>
                <li>公衆衛生・児童の健全育成のために必要で、本人の同意を得ることが困難なとき</li>
                <li>国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行するため協力が必要な場合であって、本人の同意を得ることにより当該事務の遂行に支障を及ぼすおそれがあるとき</li>
                <li>個人情報保護法その他の法令で認められるとき</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">分析ツール</p>
              <p className="text-sm text-muted-foreground">
                本サービスでは、Google Analyticsなどの外部分析ツールは使用しておりません。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">ユーザーの権利</p>
              <p className="text-sm text-muted-foreground mb-2">ユーザーは以下の権利を有します。</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>個人情報の開示請求</li>
                <li>個人情報の訂正・削除</li>
                <li>利用停止</li>
                <li>アカウントの削除</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                これらの権利行使については、お問い合わせよりご連絡ください。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">未成年の利用</p>
              <p className="text-sm text-muted-foreground">
                未成年の方が本サービスを利用する場合は、保護者の同意が必要です。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">プライバシーポリシーの変更</p>
              <p className="text-sm text-muted-foreground">
                本ポリシーは予告なく変更されることがあります。重要な変更がある場合は、サービス上でお知らせします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">お問い合わせ</p>
              <p className="text-sm text-muted-foreground">
                プライバシーに関するお問い合わせは、
                <a
                  href="https://handon.club/@highemerly"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  こちら
                </a>
                までご連絡ください。
              </p>
            </div>

            <p className="text-xs text-muted-foreground text-center">最終更新日：2026年3月18日</p>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
