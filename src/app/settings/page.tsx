import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { RegenerateEmailButton } from "./RegenerateEmailButton";
import { SiteHeader } from "@/components/layout/SiteHeader";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  const emailDomain = "pic.handon.club";

  return (
    <>
      <SiteHeader />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-8">設定</h1>

      {/* アカウント情報 */}
      <section className="bg-muted rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">アカウント情報</h2>
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">ユーザー名</dt>
            <dd className="mt-1">@{user.username}@{user.instance.domain}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">表示名</dt>
            <dd className="mt-1">{user.displayName || user.username}</dd>
          </div>
        </dl>
      </section>

      {/* メール投稿設定 */}
      <section className="bg-muted rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">メール投稿＜準備中＞</h2>
        <div className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">投稿用メールアドレス</dt>
            <dd className="mt-1">
              <code className="bg-background px-2 py-1 rounded text-sm">
                {user.emailPrefix}@{emailDomain}
              </code>
            </dd>
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">このアドレスに画像を添付してメールを送信すると、画像が生成されるようになります（いまはされません）。</p>
            <p className="mb-2 font-medium">メールの形式:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                <strong>件名:</strong> オプションをスペース区切りで指定
                <br />
                <span className="text-xs">例: 「下 赤 大 ラノベ」</span>
              </li>
              <li>
                <strong>本文:</strong> 画像に入れるテキスト（1〜140文字）
              </li>
              <li>
                <strong>添付:</strong> 画像ファイル（JPEG/PNG/WebP/HEIC/AVIF）
              </li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-medium mb-2">利用可能なオプション:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium">位置:</span> 上 下 左 右
              </div>
              <div>
                <span className="font-medium">色:</span> 白 赤 青 緑 黄 茶 桃 橙
              </div>
              <div>
                <span className="font-medium">サイズ:</span> 小 中 大
              </div>
              <div>
                <span className="font-medium">フォント:</span> ふい字 ゴシック ラノベ
              </div>
            </div>
          </div>
          <RegenerateEmailButton emailDomain={emailDomain} />
        </div>
      </section>

      {/* 公開設定 */}
      <section className="bg-muted rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">公開設定</h2>
        <div className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">公開ギャラリーURL</dt>
            <dd className="mt-1">
              <code className="bg-background px-2 py-1 rounded text-sm">
                {process.env.NEXT_PUBLIC_APP_URL}/u/{user.username}
              </code>
            </dd>
          </div>
          <p className="text-sm text-muted-foreground">
            生成した画像は自動的に公開ギャラリーに表示されます。
          </p>
        </div>
      </section>
    </div>
    </>
  );
}
