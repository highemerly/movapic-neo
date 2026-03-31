import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "技術仕様",
  description: "SHAMEZOの技術仕様・制限事項",
};

export default async function SpecPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">技術仕様</h2>
          <div className="space-y-4">

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">入力制限</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">画像</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>対応フォーマット: JPEG, PNG, WebP, HEIC, AVIF</li>
                    <li>最大ファイルサイズ: 20MB</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">テキスト</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>文字数: 1〜140文字</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">テキストの処理</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">フォントの種類</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li><span className="font-medium text-foreground">Noto Sans JP</span>：文字幅はプロポーショナルフォントで表示します。</li>
                    <li><span className="font-medium text-foreground">ふい字・ラノベPOP</span>：文字幅は等幅で表示します。ただし、半角英数字は半分の幅で表示します。</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">縦書きの処理</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>括弧類（「」、（）、【】など）と長音記号（ー〜など）は90度回転して描画します。</li>
                    <li>句読点（、。）は右上寄せで描画します。</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">文字の縁取り</p>
                  <p className="text-sm text-muted-foreground">
                    視認性を高めるため、すべての文字に縁取りを追加しています。薄い色（白、緑、黄、桃、橙）には黒い縁取り、濃い色（赤、青、茶）には白い縁取りが付きます。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">フォントサイズ</p>
                  <p className="text-sm text-muted-foreground">
                    画像のサイズに応じて自動計算されます。画像の短辺の画像幅に16文字納まる文字サイズを基準（中）として計算しています。
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">レート制限</p>
              <p className="text-sm text-muted-foreground">
                画像生成APIに短時間に連続してリクエストを送信した場合、一時的に制限がかかります。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">出力フォーマット</p>
              <p className="text-sm text-muted-foreground mb-3">投稿先に応じて最適な形式で画像を出力します。</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">出力設定</th>
                      <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">形式</th>
                      <th className="text-left py-2 font-medium text-xs text-muted-foreground">特徴</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-muted-foreground">
                    <tr className="border-b border-border">
                      <td className="py-2 pr-4">Mastodon</td>
                      <td className="py-2 pr-4">AVIF</td>
                      <td className="py-2">高圧縮・高画質。Mastodonの画像サイズ制限（16MB）に最適化</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 pr-4">Misskey</td>
                      <td className="py-2 pr-4">AVIF</td>
                      <td className="py-2">高圧縮・高画質。Misskeyの画像サイズ制限（50MB）に最適化</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">なし</td>
                      <td className="py-2 pr-4">JPEG</td>
                      <td className="py-2">汎用性が高く、どの環境でも表示可能</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">Bot投稿（メンション投稿）</p>
              <p className="text-sm text-muted-foreground">
                Botは3分に1回、メンションを定期的に確認して処理を実行します。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">画像処理について</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>スマートフォン、特にiOSで撮影した画像は、向き（Orientation）を自動補正しています</li>
                <li>プライバシー保護のため、GPS情報やカメラ情報などのメタデータは出力時に削除されます</li>
              </ul>
            </div>

          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
