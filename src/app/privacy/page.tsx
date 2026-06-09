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
              SHAMEZO（以下「本サービス」）は、個人情報保護法をはじめとする関連法令を遵守し、ユーザーの個人情報を適切に取り扱います。そのために、以下のとおりプライバシーポリシーを定めます。
            </p>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">収集する個人情報とその収集方法</p>
              <div className="space-y-3">
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">Fediverse（Mastodon/Misskey）ログイン時にサーバーから取得する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>ユーザーID</li>
                    <li>ユーザー名</li>
                    <li>表示名</li>
                    <li>プロフィール画像URL</li>
                    <li>認証トークン</li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">ログイン時にセッション履歴として保存する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>IPアドレス</li>
                    <li>User-Agent（ブラウザ・OSの識別情報）</li>
                    <li>IPアドレスから推定される接続元の国コード</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">※ ユーザー自身が不審なログインを確認できるようダッシュボードに表示するために保存します。最終ログインから90日経過した履歴は自動的に削除されます。</p>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">HTTPアクセスにより収集される情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>IPアドレス</li>
                    <li>IPアドレスから推定される接続元の国や地域の情報</li>
                    <li>接続先ポート番号</li>
                    <li>リクエスト日時</li>
                    <li>リクエスト先URL</li>
                    <li>TLSバージョン・暗号スイート</li>
                    <li>ブラウザに関する情報（User-Agent, Referer, Accept-Languageヘッダ）</li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">ユーザーが直接情報を入力することで取得する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>プロフィール説明</li>
                    <li>投稿する画像</li>
                    <li>投稿する画像にオーバーレイ表示するテキスト</li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">ユーザーが投稿時に明示的に希望した場合のみ、画像のEXIF情報から取得する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>カメラのメーカー名とモデル名</li>
                    <li>撮影場所（都道府県または都道府県+市区町村）<span className="text-xs">※詳細な位置情報（GPSの緯度経度）は保存されません。都道府県または市区町村レベルに変換した結果のみを取得します。</span></li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">メール投稿機能を利用した場合にメールから取得する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>送信元メールアドレス（エンベロープ送信者およびFromヘッダ）</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">Cookieの使用</p>
              <p className="text-sm text-muted-foreground mb-3">
              本サービスでは基本的なサービスを提供するため、以下の用途でCookieを使用しています（広告やトラッキング目的でのCookie使用は行っておりません）。
              </p>
              <div className="space-y-3">
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">セッションCookie（movapic_session）</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>目的：ログイン状態の維持</li>
                    <li>有効期限：7日間</li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">OAuth認証用一時Cookie（oauth_session, oauth_state）</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>目的：Fediverse認証プロセスの保護</li>
                    <li>有効期限：10分間</li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">お知らせ既読管理Cookie（ann）</p>
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
                <li>画像の生成サービス、画像およびコメントの投稿・閲覧サービス、Fediverseサーバーへの投稿サービス、それらを核としたソーシャルネットワーキングサービスの提供（サービス提供に必要なユーザー認証およびセッション管理を含む）</li>
                <li>ユーザー自身が各種情報を確認する機能の提供</li>
                <li>ユーザーからの問い合わせへの回答（本人確認を含む）</li>
                <li>利用規約ユーザーや不正利用ユーザーの特定および利用停止</li>
                <li>技術的不具合の原因解析（ただし、ブラウザ情報など、やむを得ず必要となる場合に限る）</li>
              </ul>          
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">セキュリティ対策、プライバシー保護</p>
              <p className="text-sm text-muted-foreground mb-3">
              本サービスの管理者は、取り扱う個人情報の漏えい・滅失・毀損を防止し、安全に管理するために必要かつ適切な安全管理措置を講じるものとします。
              </p>              
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>全ての通信はHTTPSで暗号化します</li>
                <li>アップロードされ生成された画像のEXIF情報（GPS位置情報、カメラ情報等）は常に削除し、出力画像にはメタデータが含まれないようにします</li>
                <li>カメラ機種名・撮影場所は、投稿時にユーザーが明示的に選択した場合に限り、選択範囲のみをサービスのデータベースに保存し、初期値では保存しません（「オプトイン」方式）</li>
                <li>Fediverse（Mastodon/Misskey）の認証トークンなど重要な情報は暗号化したうえで保存します</li>
                <li>重要なデータやアクセスログはバックアップを取得し適切に保管します</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">外部サービスへの情報提供</p>
              <div className="space-y-3">
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">Fediverse（Mastodon/Misskey）</p>
                  <p className="text-sm text-muted-foreground">
                    ユーザーが投稿する際、生成した画像・テキストは連携先のFediverseサーバーに投稿されます。各サーバーのプライバシーポリシーもご参照ください。
                  </p>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">国土地理院</p>
                  <p className="text-sm text-muted-foreground">
                    国土地理院の逆ジオコーディングAPIを利用しています。ユーザーが撮影場所を投稿することを明示的に選択した場合に限り、市区町村コードを取得するために、写真のEXIF情報から抽出したGPS緯度経度を送信します（ユーザーの明示的な選択がない場合には送信されません）。送信する場合、個人を特定しうる情報（ユーザー名、アカウントID、IPアドレス、画像等）は含めずに情報を送信します。国土地理院のプライバシーポリシーもご参照ください。
                    https://www.gsi.go.jp/GSI/puraibasi-porisi.htm
                  </p>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">Cloudflare Inc.</p>
                  <p className="text-sm text-muted-foreground">
                    Cloudflare, Inc.のCDN・セキュリティサービス、およびメール受信サービス（Email Routing）を利用しています。Cloudflareはサービス提供にあたり、アクセスログ（IPアドレス、User-Agent、アクセス日時等）を処理します。Cloudflareのプライバシーポリシーもご参照ください。
                    https://www.cloudflare.com/privacypolicy/
                  </p>
                </div>
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
                本サービスでは、Google Analytics などの外部分析ツールは利用しません。内部ツール（rum.piyo.me）へビーコン情報を送信することがありますが、「収集する個人情報とその収集方法」の範疇を超えた個人情報を送信することは決してありません。また、このビーコン情報は個人を特定できない形に加工されて保管され、サービスの向上やモニタリングのみに利用されます（広告やトラッキングを目的としたものではありません）。
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
                これらの権利行使については、お問い合わせよりご連絡ください。遅延なく対応することとします。なお、個人情報の開示請求については、1件あたり1,000円の手数料を申し受けます。
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
                  href="https://highemerly.net/contact.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  こちら
                </a>
                までご連絡ください。
              </p>
            </div>

            <p className="text-xs text-muted-foreground text-center">最終更新日：2026年6月9日</p>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
