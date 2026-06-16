import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "SHAMEZOのプライバシーポリシー",
};

export default async function PrivacyPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">プライバシーポリシー</h2>
          <div className="space-y-4">

            <p className="text-sm text-muted-foreground">
              SHAMEZO（以下「本サービス」）は、個人情報保護法をはじめとする関連法令を遵守し、本サービスを利用する全ての方（以下「ユーザー」）の個人情報を適切に取り扱います。そのために、以下のとおりプライバシーポリシーを定めます。本サービスの運営者を以下「管理者」といいます。
            </p>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">個人情報とは</p>
              <p className="text-sm text-muted-foreground">
              本ポリシーにおける「個人情報」とは、個人情報保護法第2条第1項に定める個人情報を指しています。例えば、氏名・メールアドレス・IPアドレスなど、特定の個人を識別できる情報を指します。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">収集する個人情報とその収集方法</p>
              <div className="space-y-3">
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-2">Fediverse（Mastodon/Misskey）ログイン時にサーバーから収集する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>ユーザーID（ACCT）</li>
                    <li>ユーザー名</li>
                    <li>表示名</li>
                    <li>プロフィール画像URLおよび画像</li>
                    <li>認証トークン</li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-2">ログイン時にセッション履歴として収集する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>IPアドレス</li>
                    <li>ログイン日時</li>
                    <li>User-Agent（ブラウザ・OSの識別情報）</li>
                    <li>IPアドレスから推定される接続元の国コード</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">※ ユーザーが不審なログインを確認できるようメニューに表示するために保存します。</p>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-2">HTTPアクセスによって収集する情報</p>
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
                  <p className="text-ms text-muted-foreground font-medium mb-2">ユーザーに情報入力をお願いすることで収集する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>プロフィール説明</li>
                    <li>投稿する画像</li>
                    <li>投稿する画像にオーバーレイ表示するテキスト</li>
                  </ul>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-2">ユーザーが投稿時に明示的に希望した場合に限り、画像のEXIF情報から収集する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>カメラのメーカー名とモデル名</li>
                    <li>撮影場所（都道府県または都道府県+市区町村）</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">※ 緯度経度情報を含む詳細な位置情報は収集しません。都道府県または市区町村レベルに加工した結果のみを収集します。</p>
                </div>
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-2">ユーザーがメール投稿機能を利用した場合に限り、メールから収集する情報</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>送信元メールアドレス（エンベロープFrom）および差出人（ヘッダFrom）</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">情報の利用目的</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>画像の生成サービス、画像およびコメントの投稿・閲覧サービス、Fediverseサーバーへの投稿サービス、それらを核としたソーシャルネットワーキングサービスの提供、セッション管理</li>
                <li>ユーザー自身が各種情報を確認する機能の提供</li>
                <li>ユーザーからの問い合わせへの回答および本人確認</li>
                <li>規約違反ユーザーや不正利用ユーザーの特定および利用停止</li>
                <li>技術的不具合の原因解析、パフォーマンス・サービスの安定性・セキュリティの改善</li>
              </ul>          
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">Cookieの使用</p>
              <p className="text-sm text-muted-foreground mb-3">
              ソーシャルネットワーキングサービスを提供するため、以下用途でCookieを使用します。ブラウザの設定によりCookieの拒否・削除を行うことはできますが、本サービスへのログイン・投稿を含む、ほぼ全ての機能が利用できなくなります。
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
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">通知既読管理Cookie（not）</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>目的：通知の既読状態を記憶</li>
                    <li>有効期限：30日間</li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
              広告・ユーザーのトラッキングの目的でCookieは使用しません。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">プライバシー保護、セキュリティ対策</p>
              <p className="text-sm text-muted-foreground mb-3">
              本サービスの管理者は、取り扱う個人情報の漏えい・滅失・毀損を防止し、安全に管理するため、必要かつ適切な安全管理措置を講じるものとします。以下はその一例です。
              </p>              
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>全ての通信はHTTPSで暗号化します</li>
                <li>アップロードされ生成された画像のEXIF情報（GPS位置情報、カメラ情報等）は常に削除し、出力画像にはメタデータが含まれないようにします</li>
                <li>カメラ機種名・撮影場所は、投稿時にユーザーが明示的に選択した場合に限り、選択範囲のみをサービスのデータベースに保存し、初期値では保存しません（「オプトイン」方式）</li>
                <li>Fediverse（Mastodon/Misskey）の認証トークンなど、特に機密性が高いと管理者が判断した情報は、暗号化したうえで保存します</li>
                <li>重要なデータ・アクセスログは原則バックアップを取得し、適切に保管します</li>
                <li>IPアドレスやUser-agentを含む「ログイン時にセッション履歴として収集する情報」および「HTTPアクセスによって収集する情報」は、最低保存期間を90日とし、それ以上経過した情報は概ね7日以内に完全に消去します</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">外部サービスへの情報提供</p>
              <div className="space-y-3">
                <div>
                  <p className="text-ms text-muted-foreground font-medium mb-1">Fediverse（Mastodon/Misskey）</p>
                  <p className="text-sm text-muted-foreground">
                    ログインおよび投稿の際、Fediverseサーバーと連携します。特に、ユーザーが明示的に投稿操作を行った際、生成した画像・テキストは連携先のFediverseサーバーに送信されます。Fediverseサーバーからは他のサーバーに投稿が配信されることがあります。各サーバーのプライバシーポリシーもご参照ください。
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
                技術的な分析のため、ビーコン情報を送信することがあります。ビーコン情報は rum.piyo.me へ送信されます。ビーコン情報を受信後速やかに個人を特定できない形に加工し、第三者がアクセスできない領域に保管します。加工された情報を、技術的不具合の解消や、パフォーマンス・サービスの安定性・セキュリティの向上のためのモニタリング用途のみに利用します。広告やユーザーのトラッキングには利用しません。
              </p>
              <p className="text-sm text-muted-foreground">
                外部の分析ツール（Google Analyticsなど）は利用しません。
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
                本サービスの管理者は、ユーザーがこれら権利行使を求め、応じる必要があると判断した場合、遅延なく対応することとします。
              </p>
              <p className="text-sm text-muted-foreground mt-2 mb-2">
                なお、個人情報の開示請求については以下のとおりとします。
              </p>              
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>開示請求1件あたり最大で1,000円の事務手数料を申し受ける場合があります</li>
                  <li>開示することで法令違反になる場合、サービス提供に著しい影響を与える場合、人の生命・身体・財産を害するおそれがある場合の少なくともいずれか一つに該当する場合、全部または一部を開示しないことがあります</li>
                </ul>                
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
                ユーザーの権利の行使、プライバシーに関する苦情やお問い合わせは、
                <a
                  href="https://highemerly.net/contact.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  こちら
                </a>
                からご連絡ください。
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
