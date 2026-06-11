import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { version } from "../../../package.json";

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
          <div className="flex items-baseline gap-2 mb-4">
            <h2 className="text-lg font-semibold">技術仕様</h2>
            <span className="text-xs text-muted-foreground">v{version}</span>
          </div>
          <div className="space-y-4">

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">入力制限</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">画像</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>対応フォーマット: JPEG, PNG, WebP, AVIF, HEIC（ベータ）</li>
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
              <p className="font-medium mb-2">その他の画像処理</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>スマートフォン、特にiOSで撮影した画像は、向き（Orientation）を自動補正しています</li>
                <li>プライバシー保護のため、GPS情報やカメラ情報などのメタデータ（EXIF）は出力画像から常に削除されます</li>
                <li>出力は原則AVIFフォーマットとなり、高解像度画像とサムネイル画像がいずれもCloudflare R2にアップロードされます</li>
              </ul>
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
                      <td className="py-2 pr-4">その他</td>
                      <td className="py-2 pr-4">JPEG</td>
                      <td className="py-2">汎用性が高く、どの環境でも表示可能</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">レート制限</p>
              <p className="text-sm text-muted-foreground">
                画像生成を短時間に連続して行った場合や、投稿数が普段より急増した場合など、いくつかのレート制限を設けています。詳細はセキュリティ上の理由から非開示とします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">Bot投稿（メンション投稿）</p>
              <p className="text-sm text-muted-foreground">
                Bot宛てにメンション付きで画像とコメントを送信すると、文字を合成して投稿可能です。Botは約3分に1回メンションを確認して処理を実行しています。処理が正常に完了した場合、元投稿は削除される仕組みとなっています。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">メール投稿</p>
              <p className="text-sm text-muted-foreground">
                メニューで確認できる専用のメールアドレスに画像を添付して送信すると、文字を合成して投稿可能です。メールは Cloudflare Email Routing により Cloudflare Workers で処理されます。セキュリティ対策（リスト型攻撃対策・MTAのバウンス防止）のため、投稿の成功・失敗によらず、サービスからは一切の返信を行いません。
              </p>
            </div>            

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">撮影情報（EXIF）の取り扱い</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Web投稿画面では、画像を選択した時点でブラウザ上でEXIFを解析します。出力画像からは常にEXIFを削除しますが、投稿時にユーザーが選択した範囲に限り、カメラ機種・撮影場所（都道府県または市町村のみ）をサービスのデータベースに保存します。
                </p>
                <div>
                  <p className="text-xs font-medium mb-1">位置情報の解析（ベータ）</p>
                  <p>GPS緯度経度は<strong>サービスには保存しません</strong>。位置情報を含む選択肢を選んだ場合のみ、国土地理院（GSI）の逆ジオコーディングAPIにGPS座標を送信し、市区町村コードを取得して都道府県名・市区町村名に変換して保存します。</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">投稿後の削除</p>
                  <p>保存した撮影場所は、投稿者本人が画像詳細ページから単独で削除できます（カメラ機種はあとから削除できません）。</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">iOSからの投稿</p>
                  <p>iOSのプライバシー保護により、Safari/Chromeなど全ブラウザで写真ピッカーから渡される画像はGPS情報が自動的に除去される場合があります。iPhone/iPadで直接アップロードする場合はGPS情報の送信を許可してください。</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">メール投稿</p>
                  <p>メール投稿では、サーバー側で元画像のEXIFを解析します。カメラ機種は、メニューの初期設定で「機種名を表示」にしているか、件名に「カメラ」と入力した場合に保存します（「カメラなし」で無効化）。撮影場所は、件名に「都道府県」または「市町村」と入力した場合のみ、GPS座標から逆ジオコーディングして保存します（GPS座標自体は保存しません）。</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Bot投稿</p>
                  <p>メンション（Bot）投稿では、画像が一度Fediverseサーバーを経由する際にEXIFが除去されるため、撮影情報は解析できません。</p>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">お気に入り</p>
              <p className="text-sm text-muted-foreground">
                Mastodonサーバーでのお気に入りとSHAMEZOのお気に入りは同期します。Mastodonサーバーでのお気に入り情報が元データとなっており、SHAMEZO側からは定期的に情報を取得して同期しています。SHAMEZO側でお気に入り登録をした場合は、バックエンドでMastodonサーバーにお気に入り登録リクエストを送信しています。投稿直後は頻繁に同期されますが、1日以上前の投稿はあまり同期されません。そのため、最新の情報ではない可能性があります。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">地図機能（ベータ）</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>ユーザーページに「地図」タブを追加し、都道府県別の投稿数をヒートマップ表示する機能です</li>
                <li>メニューで「地図を公開する（ベータ）」をオンにしたユーザーのみ公開されます（オフの場合は本人のみ閲覧可能となっています）</li>
                <li>位置情報を含めて投稿した画像のみが集計対象です</li>
              </ul>
            </div>

          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
