import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "技術仕様",
  description: "movapicの技術仕様・制限事項",
};

export default function SpecPage() {
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

        <h1 className="text-3xl font-bold text-gray-900 mb-8">技術仕様</h1>

        <div className="space-y-8">
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              入力制限
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">画像</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>対応フォーマット: JPEG, PNG, WebP, HEIC, AVIF</li>
                  <li>最大ファイルサイズ: 20MB</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">テキスト</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>文字数: 1〜140文字</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              レート制限
            </h2>
            <p className="text-gray-700">
              画像生成APIに短時間に連続してリクエストを送信した場合、一時的に制限がかかります。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              出力フォーマット
            </h2>
            <p className="text-gray-700 mb-4">
              投稿先に応じて最適な形式で画像を出力します。
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-medium text-gray-900">
                      出力設定
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-gray-900">
                      形式
                    </th>
                    <th className="text-left py-2 font-medium text-gray-900">
                      特徴
                    </th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-4">Mastodon</td>
                    <td className="py-2 pr-4">AVIF</td>
                    <td className="py-2">
                      高圧縮・高画質。Mastodonの画像サイズ制限（16MB）に最適化
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-4">Misskey</td>
                    <td className="py-2 pr-4">AVIF</td>
                    <td className="py-2">
                      高圧縮・高画質。Misskeyの画像サイズ制限（50MB）に最適化
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">なし</td>
                    <td className="py-2 pr-4">JPEG</td>
                    <td className="py-2">
                      汎用性が高く、どの環境でも表示可能
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Bot投稿（メンション投稿）
            </h2>
            <p className="text-gray-700">
              Botは3分に1回、メンションを定期的に確認して処理を実行します。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              文字描画仕様
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  フォントの種類
                </h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>
                    <span className="font-medium">Noto Sans JP</span>
                    ：プロポーショナルフォント（文字ごとに幅が異なる）
                  </li>
                  <li>
                    <span className="font-medium">ふい字・ラノベPOP</span>
                    ：等幅フォント（半角文字は全角の半分の幅で描画）
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">縦書きの処理</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-1">
                  <li>
                    括弧類（「」、（）、【】など）と長音記号（ー〜など）は90度回転して描画
                  </li>
                  <li>句読点（、。）は右上寄せで描画</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">文字の縁取り</h3>
                <p className="text-gray-700">
                  視認性を高めるため、すべての文字に縁取りを追加しています。薄い色（白、緑、黄、桃、橙）には黒い縁取り、濃い色（赤、青、茶）には白い縁取りが付きます。
                </p>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">
                  フォントサイズ
                </h3>
                <p className="text-gray-700">
                  画像のサイズに応じて自動計算されます。横書きでは画像幅に17文字、縦書きでは画像高さ約13文字が1行に収まる大きさを基準（中）として計算するようにしています。
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              画像処理について
            </h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>
                スマートフォン、特にiOSで撮影した画像は、向き（Orientation）を自動補正しています
              </li>
              <li>
                プライバシー保護のため、GPS情報やカメラ情報などのメタデータは出力時に削除されます
              </li>
            </ul>
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
