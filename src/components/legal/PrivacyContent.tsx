import { LegalTable } from "./LegalTable";

/**
 * プライバシーポリシーの本文（見出し h2 を含まない本体のみ）。
 * /privacy ページと、ログイン画面のモーダル（LegalInfoDialog）の両方から使い、
 * 内容を1箇所に集約して食い違いを防ぐ。純粋な JSX なのでサーバー/クライアント両方で利用可。
 *
 * 節の並びと言葉づかいは Hosteka（https://hosteka.piyo.me/privacy）と揃えてある。
 * 同じ管理者の別サービスなので、読む人が同じ順に同じものを探せる。片方を直すときはもう片方も見ること。
 *
 * Cookie は名前を全部載せる。定義が各所に散っているので、足したら手で載せること
 * （過去に ann / not の有効期限を実装だけ変えて、ここが古いまま残っていた）。
 * ブラウザ内の保存領域（storageKeys.ts）は種類だけを書き、キーは列挙しない。
 */
export function PrivacyContent() {
  return (
    // 長いURL（国土地理院・Cloudflare等）で min-content 幅が膨らみ、狭い端末（~320px）で
    // モーダルからはみ出すのを防ぐ。overflow-wrap:anywhere は min-content を縮めるため、
    // grid の DialogContent 内でもトラックが広がらない。min-w-0 も併用。
    <div className="space-y-4 min-w-0 [overflow-wrap:anywhere]">
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
              <li>所属サーバー名</li>
              <li>表示名</li>
              <li>プロフィール画像URLおよび画像</li>
              <li>認証トークン</li>
            </ul>
          </div>
          <div>
            <p className="text-ms text-muted-foreground font-medium mb-2">ログイン時にセッション履歴として収集する情報</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>ログイン日時</li>
              <li>IPアドレス</li>
              <li>ブラウザに関する情報（User-Agent）</li>
              <li>IPアドレスから推定される接続元の国・地域・都市</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-2">
              セッションの一覧は、ログイン後に設定の画面で確認でき、ユーザー自身の操作でいつでも失効させられます。
            </p>
          </div>
          <div>
            <p className="text-ms text-muted-foreground font-medium mb-2">HTTPアクセスによって収集する情報</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>IPアドレス</li>
              <li>IPアドレスから推定される接続元の国・地域・都市</li>
              <li>接続先ポート番号</li>
              <li>リクエスト日時</li>
              <li>リクエスト先URL</li>
              <li>TLSバージョン・暗号スイート・フィンガープリント</li>
              <li>ブラウザに関する情報（User-Agent, Referer, Accept-Languageヘッダ）</li>
              <li>その他サーバーへのアクセスログ</li>
            </ul>
          </div>
          <div>
            <p className="text-ms text-muted-foreground font-medium mb-2">ユーザーに情報入力をお願いすることで収集する情報</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>プロフィール説明</li>
              <li>投稿する画像</li>
              <li>投稿する画像にオーバーレイ表示するテキスト</li>
              <li>投稿する画像の代替テキスト</li>
              <li>他のユーザーの投稿へのリアクション</li>
            </ul>
          </div>
          <div>
            <p className="text-ms text-muted-foreground font-medium mb-2">ユーザーが投稿時に明示的に希望した場合に限り、画像のEXIF情報から収集する情報</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>カメラのメーカー名とモデル名</li>
              <li>撮影情報（F値・シャッター速度・ISO感度・焦点距離・レンズ名・露出補正・フラッシュ有無）</li>
              <li>撮影場所（都道府県または都道府県+市区町村）</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-2">
              それぞれ個別に収集を希望するかどうか選択できます。なお、撮影日時および撮影方向（GPS方位）は、いずれの選択肢でも収集しません。
            </p>
          </div>
          <div>
            <p className="text-ms text-muted-foreground font-medium mb-2">ユーザーがメール投稿機能を利用した場合に限り、メールから収集する情報</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>送信元メールアドレス（エンベロープFrom）</li>
              <li>メール差出人（ヘッダFrom）</li>
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
        <LegalTable
          caption="本サービスが使用するCookieの一覧"
          head={["Cookie名", "目的", "有効期限"]}
          rows={[
            [
              "movapic_session",
              "ログイン状態を維持するため",
              "7日間（利用のたびに延長し、ログインから最長90日間。ログアウト時に削除）",
            ],
            [
              "oauth_session",
              "Mastodonへの認証プロセスを検証し、不正ログインを防ぐため",
              "10分間（ログインの完了時に削除）",
            ],
            [
              "oauth_state",
              "Mastodonへの認証プロセスを検証し、不正ログインを防ぐため",
              "10分間（ログインの完了時に削除）",
            ],
            [
              "miauth_state",
              "Misskeyへの認証プロセスを検証し、不正ログインを防ぐため",
              "10分間（ログインの完了時に削除）",
            ],
            ["ann", "運営からのお知らせを既読管理するため", "180日間"],
            ["not", "通知を既読管理するため", "1年間"],
          ]}
        />
        <p className="text-sm text-muted-foreground mt-3">
        広告・ユーザーのトラッキングの目的でCookieは使用しません。サードパーティーCookieは使用しません。
        </p>
        <p className="text-ms text-muted-foreground font-medium mt-4 mb-2">ブラウザ内の保存領域（Cookie以外）</p>
        <p className="text-sm text-muted-foreground">
        Cookieのほか、表示の設定や一時的な表示状態などを、ブラウザ内の保存領域（localStorage、sessionStorage、Cache Storage）に保存します。これらは保存されているだけでは本サービスのサーバーへ送信されません。
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-3">外部サービスへの情報提供</p>
        <div className="space-y-3">
          <div>
            <p className="text-ms text-muted-foreground font-medium mb-1">Fediverse（Mastodon/Misskey）</p>
            <p className="text-sm text-muted-foreground">
              ログインおよび投稿の際、Fediverseサーバーと連携します。特に、ユーザーが明示的に投稿操作を行った際、生成した画像・テキストは連携先のFediverseサーバーに送信されます。ユーザーが他のユーザーの投稿にリアクションの操作を行った際も、その内容が連携先のFediverseサーバーに送信されます。Fediverseサーバーからは他のサーバーに投稿が配信されることがあります。各サーバーのプライバシーポリシーもご参照ください。
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
            <p className="text-ms text-muted-foreground font-medium mb-1">Cloudflare, Inc.</p>
            <p className="text-sm text-muted-foreground">
              Cloudflare, Inc.のCDN・セキュリティサービス、およびメール受信サービス（Email Routing）を利用しています。Cloudflareはサービス提供にあたり、アクセスログ（IPアドレス、User-Agent、アクセス日時等）を処理します。Cloudflareのプライバシーポリシーもご参照ください。
              https://www.cloudflare.com/privacypolicy/
            </p>
          </div>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4">
        <p className="font-medium mb-2">分析ツール</p>
        <p className="text-sm text-muted-foreground mb-2">
          技術的な分析のため、ページを表示したとき、以下の情報を含むビーコンを送信することがあります。
        </p>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>リクエスト先URL（クエリストリングを除く）、ページの開き方（通常・再読み込み・戻る/進む）、計測日時</li>
          <li>表示や操作への応答に要した時間、レイアウトのずれ、受信したデータ量、CDNのキャッシュヒット有無と応答した拠点</li>
          <li>端末の種別、OS・ブラウザの種類（バージョンを除く）</li>
          <li>回線の種別、通信プロトコル、AS番号、IPアドレスから推定される接続元の国・地域</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-2">
          ビーコンには、Cookie、ユーザーやブラウザを識別するID、IPアドレス、User-Agentを含めず、第三者がアクセスできない領域に保管します。技術的不具合の解消と、パフォーマンス・安定性・セキュリティの向上のためだけに利用し、広告やユーザーのトラッキングには利用しません。Google Analytics などの外部の分析ツールにも送信しません。
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Global Privacy Control（GPC）を有効にしたブラウザからは送信しません（対応するブラウザまたは拡張機能が必要です）。
        </p>
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
        <p className="font-medium mb-2">プライバシー保護、セキュリティ対策</p>
        <p className="text-sm text-muted-foreground mb-3">
        本サービスの管理者は、取り扱う個人情報の漏えい・滅失・毀損を防止し、安全に管理するため、必要かつ適切な安全管理措置を講じるものとします。以下はその一例です。
        </p>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>全ての通信はHTTPSで暗号化します</li>
          <li>アップロードされ生成された画像のEXIF情報（GPS位置情報、カメラ情報等）は常に削除し、出力画像にはメタデータが含まれないようにします</li>
          <li>カメラ機種名・詳細な撮影情報・撮影場所は、投稿時にユーザーが明示的に選択した場合に限り、選択範囲のみをサービスのデータベースに保存し、初期値では保存しません（「オプトイン」方式）</li>
          <li>Fediverse（Mastodon/Misskey）の認証トークンなど、特に機密性が高いと管理者が判断した情報は、暗号化したうえで保存します</li>
          <li>ログイン時にFediverseサーバーへ求める権限は、サービスの提供に必要な範囲に限ります</li>
          <li>セッションCookieは、ブラウザ上のスクリプトから読み取れない形式（httpOnly）で発行します</li>
          <li>ログイン中のセッションはユーザー自身が一覧で確認でき、不審なものをいつでも失効させられます</li>
          <li>重要なデータ・アクセスログは原則バックアップを取得し、適切に保管します</li>
          <li>IPアドレスやUser-agentを含む「ログイン時にセッション履歴として収集する情報」および「HTTPアクセスによって収集する情報」は、保存期間を90日とし、保存期間を経過した情報は速やかに完全に消去します</li>
        </ul>
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
        <p className="text-sm text-muted-foreground mt-2">
          これらの権利行使については、サービス内の機能（設定の画面からのアカウント削除など）または下記のお問い合わせ先よりご連絡ください。
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

      <p className="text-xs text-muted-foreground text-center">最終更新日：2026年10月5日</p>
    </div>
  );
}
