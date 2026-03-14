import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "movapicのプライバシーポリシー",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← トップページに戻る
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          プライバシーポリシー
        </h1>

        <div className="space-y-8">
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              基本方針
            </h2>
            <p className="text-gray-700">
              本サービス（以下「movapic」）は、個人情報保護法をはじめとする関連法令を遵守し、ユーザーの個人情報を適切に取り扱います。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              収集する情報
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  Fediverse（Mastodon/Misskey）にログインした際にそのサーバーから取得する情報
                </h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>ユーザーID</li>
                  <li>ユーザー名</li>
                  <li>表示名</li>
                  <li>プロフィール画像URL</li>
                  <li>認証トークン</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  ユーザーが入力することで取得する情報
                </h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>プロフィール説明</li>
                  <li>画像および追加するテキスト</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  自動的に収集される情報
                </h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>
                    IPアドレス
                  </li>
                  <li>ログイン日時</li>
                  <li>投稿日時</li>
                  <li>ブラウザに関する情報（User-agentなど）</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Cookieの使用
            </h2>
            <p className="text-gray-700 mb-4">
              本サービスでは以下の目的でCookieを使用しています。広告やトラッキング目的でのCookie使用は行っておりません。
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  セッションCookie（movapic_session）
                </h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>目的：ログイン状態の維持</li>
                  <li>有効期限：7日間</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  OAuth認証用一時Cookie（oauth_session, oauth_state）
                </h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>目的：Fediverse認証プロセスの保護</li>
                  <li>有効期限：10分間</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              情報の利用目的
            </h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>画像生成・投稿サービスの提供</li>
              <li>ユーザー認証およびセッション管理</li>
              <li>Fediverseへの投稿機能の提供</li>
              <li>サービスの改善・開発</li>
              <li>不正利用防止・セキュリティ対策</li>
            </ul>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              プライバシー保護・セキュリティ対策
            </h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>
                アップロードされた画像のEXIF情報（GPS位置情報、カメラ情報等）は自動的に削除され、元画像のメタデータは含まれません
              </li>
              <li>
                Fediverse（Mastodon/Misskey）の認証トークンなど重要な情報は暗号化して保存されます
              </li>
            </ul>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              外部サービスへの情報提供
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  Fediverse（Mastodon/Misskey）
                </h3>
                <p className="text-gray-700">
                  ユーザーが投稿を選択した場合、生成した画像とテキストが連携先のFediverseサーバーに投稿されます。
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              第三者への提供
            </h2>
            <p className="text-gray-700">
              法令に基づく場合を除き、ユーザーの同意なく第三者に個人情報を提供することはありません。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              分析ツール
            </h2>
            <p className="text-gray-700">
              本サービスでは、Google Analyticsなどの外部分析ツールは使用しておりません。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              ユーザーの権利
            </h2>
            <p className="text-gray-700 mb-4">
              ユーザーは以下の権利を有します。
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>個人情報の開示請求</li>
              <li>個人情報の訂正・削除</li>
              <li>利用停止</li>
              <li>アカウントの削除</li>
            </ul>
            <p className="text-gray-700 mt-4">
              これらの権利行使については、お問い合わせよりご連絡ください。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              セキュリティ
            </h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>認証トークンはAES-256-GCMで暗号化して保存</li>
              <li>通信はHTTPSで暗号化</li>
              <li>セキュリティヘッダー（CSP、X-Frame-Options等）を設定</li>
              <li>セッションCookieはhttpOnly属性で保護</li>
            </ul>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              未成年の利用
            </h2>
            <p className="text-gray-700">
              未成年の方が本サービスを利用する場合は、保護者の同意が必要です。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              プライバシーポリシーの変更
            </h2>
            <p className="text-gray-700">
              本ポリシーは予告なく変更されることがあります。重要な変更がある場合は、サービス上でお知らせします。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              お問い合わせ
            </h2>
            <p className="text-gray-700">
              プライバシーに関するお問い合わせは、
              <a
                href="https://handon.club/@highemerly"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                こちら
              </a>
              までご連絡ください。
            </p>
          </section>

          <section className="text-center text-gray-500 text-sm">
            <p>最終更新日：2026年3月14日</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
