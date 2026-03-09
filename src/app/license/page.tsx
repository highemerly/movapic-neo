import Link from "next/link";

export default function LicensePage() {
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
          フォントライセンス
        </h1>

        <p className="text-gray-600 mb-8">
          本サービスでは以下のフォントを使用しています。
        </p>

        <div className="space-y-8">
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Noto Sans JP
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Copyright © Google LLC
            </p>
            <p className="text-gray-700 mb-4">
              本フォントは SIL Open Font License, Version 1.1 のもとで配布されています。
            </p>
            <a
              href="https://scripts.sil.org/OFL"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
            >
              https://scripts.sil.org/OFL
            </a>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">ふい字</h2>
            <p className="text-sm text-gray-500 mb-4">
              Copyright © ふい字置き場
            </p>
            <p className="text-gray-700 mb-2">
              本フォントは作者による独自ライセンスのもとで配布されており、
              商用・非商用を問わず無料で利用できます。
            </p>
            <p className="text-gray-700">
              フォントファイルの販売および加工は禁止されています。
            </p>
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              ラノベPOP V2
            </h2>
            <p className="text-sm text-gray-500 mb-2">
              Copyright © 2019 フロップデザイン
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Derived from M+ FONTS: Copyright © 2019 M+ FONTS PROJECT
            </p>
            <p className="text-gray-700 mb-4">
              本フォントは M+ FONTS License のもとで配布されています。
            </p>
            <a
              href="https://booth.pm/ja/items/2328262"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
            >
              https://booth.pm/ja/items/2328262
            </a>
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
