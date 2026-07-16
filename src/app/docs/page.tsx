import type { Metadata } from "next";
import Link from "@/components/Link";
import { History, ChevronRight, Type, ChartColumn } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { PermissionTabs } from "@/components/auth/PermissionTabs";
import { sortedReleaseNotes } from "@/data/releaseNotes";
import { version } from "../../../package.json";

export const metadata: Metadata = {
  title: "ドキュメント",
  description: "SHAMEZOのドキュメント・制限事項",
};

export default async function SpecPage() {
  const user = await getCurrentUser();
  const latestVersion = sortedReleaseNotes()[0]?.version;

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <div className="flex items-baseline gap-2 mb-4">
            <h2 className="text-lg font-semibold">ドキュメント</h2>
            <span className="text-xs text-muted-foreground tabular-nums">v{version}</span>
          </div>

          <div className="space-y-3 mb-4">
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">リリースノート（更新履歴）</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {latestVersion && (
                  <Link
                    href={`/docs/release-note/${latestVersion}`}
                    className="inline-flex items-center gap-1 rounded-md bg-background/60 px-3 py-2 text-sm hover:bg-background transition-colors"
                  >
                    最新（v{latestVersion}）
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  </Link>
                )}
                <Link
                  href="/docs/release-note"
                  className="inline-flex items-center gap-1 rounded-md bg-background/60 px-3 py-2 text-sm hover:bg-background transition-colors"
                >
                  すべての履歴
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                </Link>
              </div>
            </div>

            <Link
              href="/license"
              className="flex items-center justify-between gap-4 bg-muted rounded-lg p-4 hover:bg-muted/70 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Type className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">フォントライセンス</span>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </Link>

            <Link
              href="/stats"
              className="flex items-center justify-between gap-4 bg-muted rounded-lg p-4 hover:bg-muted/70 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ChartColumn className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">統計</span>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </Link>
          </div>

          <div className="space-y-4">

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">システム構成</p>
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  処理を担う3コンポーネント（プロセス）と、共有するデータストアで構成されます。画像処理のような重い処理は専用のコンポーネントへ隔離し、スケールできるように配慮されています。
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">構成要素</th>
                        <th className="text-left py-2 font-medium text-xs text-muted-foreground">役割</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-muted-foreground">
                      <tr className="border-b border-border align-top">
                        <td className="py-2 pr-4">web (Node.js)</td>
                        <td className="py-2">フロントエンドです。レンダリングと軽量なAPIを公開します。</td>
                      </tr>
                      <tr className="border-b border-border align-top">
                        <td className="py-2 pr-4">worker-front (Node.js)</td>
                        <td className="py-2">ジョブ管理です。Web・Bot・メールの各経路からのリクエストを管理し、画像処理ノードへの指示、およびそのためのAPIを公開します。また、一部の定期ジョブのスケジューラーも兼ねています。
                        </td>
                      </tr>
                      <tr className="border-b border-border align-top">
                        <td className="py-2 pr-4">worker (Node.js)</td>
                        <td className="py-2">画像処理です。外部には公開されていません。</td>
                      </tr>
                      <tr className="border-b border-border align-top">
                        <td className="py-2 pr-4">PostgreSQL</td>
                        <td className="py-2">投稿・ユーザー・実績などのデータを保存します。</td>
                      </tr>
                      <tr className="align-top">
                        <td className="py-2 pr-4">Object Storage</td>
                        <td className="py-2">生成した画像やサムネイルを保存します。</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">画像処理</p>
              <p className="text-sm text-muted-foreground mb-3">
                元画像とパラメーターを受け取ると、即座に画像処理を行い、出力します。処理は、ベータテスト期間中のA/Bテストを通じて、品質を確保しつつより早い処理を実現するパイプライン処理を最適化しています。
              </p>
              <figure className="mb-4">
                <div className="overflow-x-auto rounded-lg bg-background/40 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/diagrams/pipeline-light.svg"
                    alt="画像処理フロー: 回転→HEIC/HEIF判定でJPEG化→長辺2048px判定で縮小→テキスト合成→中間JPEG→AVIF化（上限超過なら品質を下げて再試行）→生成画像"
                    className="block dark:hidden h-[220px] w-auto max-w-none"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/diagrams/pipeline-dark.svg"
                    alt=""
                    aria-hidden="true"
                    className="hidden dark:block h-[220px] w-auto max-w-none"
                  />
                </div>
                <figcaption className="mt-2 text-center text-xs text-muted-foreground">
                  生成リクエスト受信後のサーバー側画像処理フロー（横にスクロールできます）
                </figcaption>
              </figure>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">向きの補正・デコード</p>
                  <p className="text-sm text-muted-foreground">
                    スマートフォンなどでは、縦向きで撮影した場合でも、画像自体は横向きに保存されることが多いです。EXIF の Orientation タグを参照したうえで、向きを補正します。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">リサイズ</p>
                  <p className="text-sm text-muted-foreground">
                    長辺が 2048px を超える入力画像は、あらかじめアスペクト比を保ったまま長辺 2048px へ縮小してから後続の処理に回します。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">文字合成</p>
                  <p className="text-sm text-muted-foreground">
                    テキストオーバーレイを Canvas 描画し、画像に合成します。パフォーマンスを維持するため、合成画像は一度JPEG（quality 90）で出力します。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">最終出力</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    投稿先に応じた形式・サイズ上限で書き出します。この出力時の再エンコードで、元画像の EXIF メタデータは全て取り除かれます。
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">投稿先</th>
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">形式</th>
                          <th className="text-left py-2 font-medium text-xs text-muted-foreground">サイズ上限</th>
                          <th className="text-left py-2 font-medium text-xs text-muted-foreground">EXIF</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-muted-foreground">
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">Mastodon</td>
                          <td className="py-2 pr-4">AVIF</td>
                          <td className="py-2">16MB</td>
                          <td className="py-2">削除</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">Misskey</td>
                          <td className="py-2 pr-4">AVIF</td>
                          <td className="py-2">250MB</td>
                          <td className="py-2">削除</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground/80">
                    AVIF出力では、 quality 80, effort 2 で書き出し、サイズを確認します。万が一出力がサイズ上限を超えた場合、quality を段階的に下げて再エンコードし、上限以下に収まった時点の出力を採用します。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">派生画像</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>カレンダー用サムネイル： WebP, 128×128px, quality 80  / あらかじめ作成し、ストレージに保存</li>
                    <li>OGP用サムネイル： WebP / 必要に応じてオンデマンドで作成し、ストレージに保存しない</li>
                  </ul>
                  <p className="mt-2 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground/80">
                    通常、OGP用には本来の生成画像を指定することも可能です。しかし、XはAVIFに対応していないため、他のレガシーなフォーマットへの変換が必要です。そこで、SHAMEZO内ではWebP変換を行わず、管理者が開発・運用している別インフラ（自前のMisskeyメディアプロキシ）でオンデマンド変換を行い、OGP用のサムネイルを作成しています。このサムネイルはストレージには格納されず、主にCDNのキャッシュに頼っています。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">タイムアウト</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    不明なエラーを発生させないため、Tier ごとにカスケードタイムアウトを設定しています。
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">Tier</th>
                          <th className="text-left py-2 font-medium text-xs text-muted-foreground">制限時間</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-muted-foreground">
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">画像処理本体</td>
                          <td className="py-2">18秒</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">API</td>
                          <td className="py-2">22秒</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4">ブラウザ（Web投稿の場合）</td>
                          <td className="py-2">25秒</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground/80">
                    アップロード処理は全体のタイムアウト値に含まれません。アップロードのタイムアウト値はなく、回線が遅い場合でも原則として永遠に待ち続けます。ただし、アップロードが20秒以上まったく進まなくなった場合のみ、中断されます。
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">入力制限</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">画像</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>枚数: 1枚</li>
                    <li>フォーマット: JPEG, PNG, WebP, AVIF, HEIC, HEIF</li>
                    <li>最大ファイルサイズ: 20MB</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">合成テキスト</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>文字数: 1〜140 文字</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">代替テキスト（ALT）</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>文字数: 0〜1,500 文字</li>
                  </ul>
                  <p className="mt-2 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground/80">
                    Misskeyへ投稿する場合、代替テキストの上限は 512 文字に自動で切り詰められます。ただし、その場合でも SHAMEZO 上には最大 1,500 文字が保存されます。
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">テキスト合成</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">文字位置</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>方向: 上下は横書き、左右は縦書き</li>
                    <li>マージン: 全方向に画像短辺の5%または10pxの大きい方のマージンを設けて文字を描画（文字サイズ・文字位置により変動しない）</li>
                    <li>折り返し: マージンを除いた描画領域で、超過した位置で改行</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">文字サイズ</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    サイズ指定（小/中/大/特大）は、画像に対する相対的なサイズです。画像の短辺に14文字が納まる文字サイズを基準（中）とし、指定した倍率で描画します。
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">設定</th>
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">基準に対する倍率</th>
                          <th className="text-left py-2 font-medium text-xs text-muted-foreground">短辺に納まる文字数</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-muted-foreground">
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">小</td>
                          <td className="py-2 pr-4">0.75倍</td>
                          <td className="py-2">約18文字</td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="py-2 pr-4">中</td>
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
                  <p className="mt-2 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground/80">
                    文字サイズには下限14px・上限500pxのハードリミットがあり、上記よりも優先されます。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">文字幅</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Noto Sans JP（プロポーショナルフォント）： フォントのもつ幅で描画</li>
                    <li>ふい字・ラノベPOP（等幅フォント）： 等幅で描画</li>
                  </ul>
                  <p className="mt-2 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground/80">
                    等幅フォントの場合でも、ASCII文字列 U+0020–U+007E と半角カナ U+FF61–U+FF9F は半分の幅になるよう調整します。また、後述する Emoji は別処理となります。
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">縦書き</p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>括弧類（「」、（）、【】など）・長音記号（ー〜など）・リーダー（…‥）は90度回転して描画</li>
                    <li>句読点（、。）は右上寄せ</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">縁取りとカラー</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    視認性を高めるため、すべての文字に縁取りを追加して描画します。薄い色（白・緑・黄・桃・橙）には黒い縁取り、濃い色（赤・青・茶）には白い縁取りが付きます。縁取りは文字サイズのおよそ0.1倍（ただし最小は2px）となります。
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">カラー</th>
                          <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">文字色</th>
                          <th className="text-left py-2 font-medium text-xs text-muted-foreground">縁取り色</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-muted-foreground">
                        {[
                          { name: "白", fill: "#FFFFFF", stroke: "#000000" },
                          { name: "赤", fill: "#FF0000", stroke: "#FFFFFF" },
                          { name: "青", fill: "#0000FF", stroke: "#FFFFFF" },
                          { name: "緑", fill: "#00FF00", stroke: "#000000" },
                          { name: "黄", fill: "#FFFF00", stroke: "#000000" },
                          { name: "茶", fill: "#8B4513", stroke: "#FFFFFF" },
                          { name: "桃", fill: "#FFC0CB", stroke: "#000000" },
                          { name: "橙", fill: "#FFA500", stroke: "#000000" },
                        ].map((c, i, arr) => (
                          <tr key={c.name} className={i < arr.length - 1 ? "border-b border-border" : undefined}>
                            <td className="py-2 pr-4">{c.name}</td>
                            <td className="py-2 pr-4">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-sm ring-1 ring-border"
                                  style={{ backgroundColor: c.fill }}
                                />
                                <span className="font-mono text-xs">{c.fill}</span>
                              </span>
                            </td>
                            <td className="py-2">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-sm ring-1 ring-border"
                                  style={{ backgroundColor: c.stroke }}
                                />
                                <span className="font-mono text-xs">{c.stroke}</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Emoji</p>
                  <p className="text-sm text-muted-foreground">
                    ユーザーのフォント設定によらず、絵文字は常に Noto Emoji を用いて描画します。このフォントは本来プロポーショナルフォントのため、等幅フォントのふい字・ラノベPOPとともに使う場合は、ラインがずれないよう、 Noto Emoji 側の表示位置を調整しています。
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">EXIFに関する追加処理</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  位置情報・撮影日時・カメラ機種などが含まれるEXIF（Exchangeable image file format）情報は、個人情報が含まれる可能性があるため、常に削除してから投稿・アップロードします。
                  また、受け取った画像のEXIFは通常解析しません。
                </p>
                <p>
                  しかし、ユーザーが明示的に希望した場合に限って、EXIFを解析し、希望した範囲の情報を保存・投稿することもできます。
                  この場合でも、撮影日時・撮影方向・GPS座標は保存しません。
                </p>
                <div>
                  <p className="text-xs font-medium mb-2">サーバーに保存される内容</p>
                  <div className="overflow-x-auto">
                  <table className="min-w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">投稿形式</th>
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">カメラ機種</th>
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">カメラ撮影情報</th>
                        <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground">位置情報</th>
                        <th className="text-left py-2 font-medium text-xs text-muted-foreground">EXIF全体</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm text-muted-foreground">
                      <tr className="border-b border-border">
                        <td className="py-2 pr-4">Web</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2">×</td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-2 pr-4">Bot</td>
                        <td className="py-2 pr-4">×</td>
                        <td className="py-2 pr-4">×</td>
                        <td className="py-2 pr-4">×</td>
                        <td className="py-2">×</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4">メール</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2 pr-4">希望時のみ</td>
                        <td className="py-2">×</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                  <ul className="list-disc list-inside space-y-1 mt-3">
                    <li>カメラ機種: カメラの機種および製造元</li>
                    <li>カメラ撮影情報: F値・シャッター速度・ISO感度・焦点距離・レンズ名・露出補正・フラッシュの有無</li>
                    <li>位置情報: 国内の場合、都道府県または市町村レベル（GPS座標は含まない）</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">解析方法</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Web投稿: 画像を選択した時点で、お使いのブラウザ上で EXIF 解析を行います（サーバー上では解析しません）</li>
                    <li>Bot投稿: Fediverse サーバー投稿時に EXIF が除去されてしまうため、EXIF 解析はサポートしていません</li>
                    <li>メール投稿: メール受信時、サーバー上で元画像の EXIF 解析を行います</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">位置情報の変換</p>
                  <p>ユーザーが希望した場合のみ、国土地理院の逆ジオコーディング API に GPS 座標を送信し、市区町村コードを取得します。
                     この場合でも、保存されるのは都道府県または市町村までの情報で、GPS 座標は詳細なデバッグ用のログを含め、一切記録されません。</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">ブラウザの制限についての補足</p>
                  <p>スマートフォンのプライバシー保護機能により、Web投稿の場合、位置情報のみが自動的に除去されることがあります。</p>
                  <ul className="list-disc list-inside space-y-1 mb-2 mt-2">
                    <li>iOS: 写真選択時、画面下部のオプションにて位置情報を含める設定に変更することで、位置情報をアップロードできます</li>
                    <li>Android: 必ず回避できる方法はありませんが、機種・OSバージョンによって以下いずれの方法かで成功することもあります
                      <ul className="list-disc list-inside space-y-1 mt-1 pl-5">
                        <li>(1) 「写真を撮る」でその場で撮影</li>
                        <li>(2) OS標準の共有機能で、SHAMEZOのPWAアプリに写真を送信</li>
                      </ul>
                    </li>
                  </ul>
                  <p>なお、Web投稿では、写真に位置情報が含まれない場合、過去に一度投稿したことのある都道府県または市町村に限って、手動で設定するオプションがあります。</p>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">レート制限</p>
              <p className="text-sm text-muted-foreground">
                画像生成を短時間に連続して行った場合や、投稿数が普段より急増した場合など、いくつかのレート制限を設けています。詳細はセキュリティ上の理由から非開示とします。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">Webブラウザ以外の投稿方法</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Bot投稿（メンション投稿）</p>
                  <p className="text-sm text-muted-foreground">
                    Bot宛にメンション付きで画像とコメントを送信して投稿します。BotはWebSocketでメンションを監視しており、ほぼ即座に処理が開始されます。定期的なポーリングで取りこぼしを補完します。処理が正常に完了した場合、元投稿は削除される仕組みとなっています（設定で変更可能）。
                  </p>
                  <Link
                    href="/create/bot"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    使い方・稼働状況をみる
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">メール投稿</p>
                  <p className="text-sm text-muted-foreground">
                    メニューで確認できる専用のメールアドレスに画像を添付して送信して投稿します。メールは Cloudflare Email Routing により Cloudflare Workers で処理され、ほぼ即座に処理が開始されます。セキュリティ対策（リスト型攻撃対策・MTAのバウンス防止）のため、投稿の成功・失敗によらず、サービス側からは一切のメール返信を行いません。
                  </p>
                  <Link
                    href="/create/mail"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    使い方をみる
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">機能: お気に入り</p>
              <p className="text-sm text-muted-foreground">
                Fediverse上（Mastodonサーバー・Misskeyサーバー）上でのお気に入りとSHAMEZOのお気に入りは自動で同期されます。
              </p>
              <ul className="mt-4 list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Fediverseサーバー上の情報が元データです</li>
                  <li>SHAMEZO側から投稿元のサーバーに対し、お気に入り件数などを取得します（結果はSHAMEZO側にキャッシュされており、投稿直後は比較的頻繁に取得しますが、投稿から時間が経つと頻度を落としています）</li>
                  <li>Fediverseサーバー上でお気に入り登録した場合、一定期間後にSHAMEZO側にも反映されます</li>
                  <li>SHAMEZO上でお気に入り登録した場合、あなたの所属するFesiberseサーバー上でお気に入り登録を行うため、Fediverse上・SHAMEZO側の両方にほぼ即時に反映されます（連合による遅延が発生する場合があります）</li>
              </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-3">機能: サーバーで開く</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Fediverseでは、同じ投稿でもサーバーごとに別々のローカルID（Mastodonのステータス ID／Misskeyのノート ID）が割り当てられます。そのため、投稿者のサーバー上のURLをそのまま開いても、閲覧者は自分のアカウントで返信・ブースト（リノート）・お気に入りといった操作ができません。「サーバーで開く」は、投稿のActivityPub URIを閲覧者自身のサーバーで解決し、閲覧者のアカウントで操作できる状態にして開く機能です。
                </p>
                <p>
                  閲覧者が自分のFediverseサーバーのWebにログインしており、かつ元投稿が実際にFediverseへ投稿されている場合にのみ利用できます。
                </p>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">ローカルID解決方法</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Mastodon： 閲覧者のサーバーの authorize_interaction に URI を渡し、サーバー側で解決</li>
                    <li>Misskey： クリック時にSHAMEZO内部で URI を解決し、閲覧者のサーバー上のローカルなノートIDを特定してから開く</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">機能: 皆勤賞</p>
              <p className="text-sm text-muted-foreground">
                皆勤賞は、SHAMEZOにおける最も栄誉のある実績です。
              </p>
                <ul className="mt-4 list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>その月に毎日投稿することで獲得できます</li>
                  <li>1日の基準は日本標準時間の0:00~23:59です</li>
                  <li>投稿できなかった日が月3日以下（handon.club のユーザーは月4日以下）であれば救済措置があり、同月中の後日2枚以上投稿すると、投稿できなかった日の穴埋めとして処理されます</li>
                  <li>穴埋めは古い未投稿日から1日につき1回（1日のダブル投稿で1日分）で、未来の日付や月末以降に残った未投稿日は埋められません</li>
                  <li>皆勤賞はユーザー画面のカレンダータブ・実績タブで公開され、誰でも確認できます</li>
                  <li>皆勤賞は月ごとに計算されるため、毎月獲得することができます</li>
                </ul>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-2">機能: カレンダー</p>
              <p className="text-sm text-muted-foreground">
                ユーザーページの「カレンダー」タブでは、その月の投稿を日ごとのサムネイルで一覧表示します。
                編集モードでは、各日に表示するサムネイルを変更できるほか、皆勤賞の穴埋めに使う投稿も選び直せます
                （サムネイルを変更後、その画像が削除された場合は、自動で再選出されます）。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="font-medium">トークンに必要な権限</p>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                ログイン時、連携する Fediverse サーバーに対し、以下の権限スコープを要求します。投稿・画像アップロード・お気に入りなど、必要な最小限の範囲に限っています。
              </p>
              <PermissionTabs />
            </div>

          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
