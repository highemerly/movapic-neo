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
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain } : null} />
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
              <p className="font-medium mb-3">テキストの合成処理</p>
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
                  <p className="text-sm text-muted-foreground mb-3">
                    画像のサイズに応じて自動計算されます。画像の短辺に約14文字が納まる文字サイズを基準（中）とし、設定に応じて倍率をかけて計算します（下限14px・上限500px）。
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">サイズ設定</th>
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">基準（中）に対する倍率</th>
                          <th className="text-left py-2 font-medium text-xs text-muted-foreground">短辺に納まる文字数の目安</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-muted-foreground">
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">小</td>
                          <td className="py-2 pr-4">0.75倍</td>
                          <td className="py-2">約18文字</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">中（基準）</td>
                          <td className="py-2 pr-4">1.0倍</td>
                          <td className="py-2">約14文字</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">大</td>
                          <td className="py-2 pr-4">1.4倍</td>
                          <td className="py-2">約10文字</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4">特大</td>
                          <td className="py-2 pr-4">2.35倍</td>
                          <td className="py-2">約6文字</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">画像処理</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>iOSで撮影した画像は、向き（Orientation）を自動補正します</li>
                <li>写真に含まれる撮影位置情報・撮影日時・撮影カメラ機種などのメタデータ（EXIF）は常に削除してアップロードされます</li>
                <li>AVIF形式で高い圧縮を行います（同時に生成されるサムネイル画像はWebpです）。</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">EXIF処理</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  出力画像からは、撮影位置情報・撮影日時・カメラ機種などのEXIFを<strong>常に削除</strong>してから投稿・アップロードします。そのまえに、ユーザーが希望した範囲に限って、EXIFを解析し、カメラ機種・撮影場所（都道府県または市町村のみ）などをデータベースに保存することもできます。
                </p>
                <div className="overflow-x-auto">
                  <p className="text-xs font-medium mb-2">サーバーに保存される内容</p>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">投稿形式</th>
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">カメラ機種</th>
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">位置情報</th>
                        <th className="text-left py-2 font-medium text-xs text-muted-foreground">EXIF全体</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-muted-foreground">
                      <tr className="border-b border-border">
                        <td className="py-2 pr-4">Web投稿</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2">×</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-2 pr-4">Bot投稿</td>
                        <td className="py-2 pr-4">×</td>
                        <td className="py-2 pr-4">×</td>
                        <td className="py-2">×</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">メール投稿</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2">×</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">解析方法</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Web投稿</strong>: 画像を選択した時点で、お使いのブラウザ上でEXIF解析を行います。</li>
                    <li><strong>Bot投稿</strong>: Fediverseサーバー投稿時にEXIFは通常除去されてしまうため、解析を行いません。</li>
                    <li><strong>メール投稿</strong>: EXIFを付与したまま送信されていれば、サーバー側で元画像のEXIF解析を行います。</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">位置情報の変換</p>
                  <p>位置情報を含む選択肢を選んだ場合のみ、SHAMEZOサーバーから国土地理院（GSI）の逆ジオコーディングAPIにGPS座標を送信し、市区町村コードを取得して保存します。
                     Web投稿ではGPS座標をブラウザからSHAMEZOサーバーへ一度送信し、市区町村コードに変換します（この場合でも、GPS座標そのものはサーバーには保存されません）。</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">ブラウザ仕様</p>
                  <p>スマートフォンのプライバシー保護機能により、Web投稿の場合にGPS情報が自動的に除去される場合があります。iOSでアップロードする場合はGPS情報の送信を許可してください。Androidでアップロードする場合、機種によっては「タップして写真を撮る」を使ってその場で撮影することでGPS情報付きでアップロードできる場合があります。</p>
                </div>
              </div>
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
                Bot宛にメンション付きで画像とコメントを送信すると、文字を合成して投稿可能です。BotはWebsocketを利用してメンションを確認しているため、ほぼ即座に処理されるはずです。処理が正常に完了した場合、元投稿は削除される仕組みとなっています（設定で変更可能）。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">メール投稿</p>
              <p className="text-sm text-muted-foreground">
                メニューで確認できる専用のメールアドレスに画像を添付して送信すると、文字を合成して投稿可能です。メールは Cloudflare Email Routing により Cloudflare Workers で処理されます。セキュリティ対策（リスト型攻撃対策・MTAのバウンス防止）のため、投稿の成功・失敗によらず、サービスからは一切の返信を行いません。
              </p>
            </div>            

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">お気に入り</p>
              <p className="text-sm text-muted-foreground">
                Fediverse上（Mastodonサーバー・Misskeyサーバー）上でのお気に入りとSHAMEZOのお気に入りは自動で同期されます。
              </p>
              <ul className="mt-4 list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Fediverse上の情報が元データです</li>
                  <li>SHAMEZO側から定期的に情報を取得し同期します（投稿直後はより頻繁に同期されます）</li>
                  <li>Fediverse上でお気に入り登録した場合、SHAMEZO側にも表示されますが、若干のタイムラグがあります</li>
                  <li>SHAMEZO上でお気に入り登録した場合、即座にFediverse上に反映されます</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">皆勤賞</p>
              <p className="text-sm text-muted-foreground">
                皆勤賞は、SHAMEZOにおける最も栄誉のある実績です。
              </p>
                <ul className="mt-4 list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>その月に毎日投稿することで獲得できます</li>
                  <li>1日の基準は日本標準時間の0:00~23:59です</li>
                  <li>投稿できなかった日が月4日以下であれば救済措置があり、同月中の後日2枚以上投稿すると、投稿できなかった日の穴埋めとして処理されます</li>
                  <li>穴埋めは古い未投稿日から1日につき1回（1日のダブル投稿で1日分）で、未来の日付や月末以降に残った未投稿日は埋められません</li>
                  <li>皆勤賞はユーザー画面のカレンダータブ・実績タブで公開され、誰でも確認できます</li>
                  <li>皆勤賞は月ごとに計算されるため、毎月獲得することができます</li>
                </ul>
            </div>            

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">地図機能</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>ユーザーページに「地図」タブを追加し、都道府県別の投稿数をヒートマップ表示する機能です</li>
                <li>メニューで「地図を公開する」をオンにしたユーザーのみ公開されます（オフの場合は本人のみ閲覧可能）</li>
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
