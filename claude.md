# 画像文字入れサービス / SHAMEZO
全て日本語で回答しなさい。

## 概要
画像に文字（コメント）を入れて生成し、Fediverseに同時投稿するWebアプリ。

## ページ名称
- `/` → トップページ
- `/dashboard` → メニュー／ダッシュボード
- `/create` → 投稿ページ
- `/u/[username]` → ユーザーページ
- `/u/[username]/calendar` → カレンダーページ
- `/u/[username]/achievements` → 実績ページ
- `/u/[username]/status/[imageId]` → 画像詳細ページ
- `/public` → 公開タイムライン
- `/favorite` → お気に入り

## 技術スタック
- フレームワーク: Next.js 16 (App Router)
- UI: Tailwind CSS + shadcn/ui
- 画像処理: sharp + skia-canvas（サーバーサイド）。HEIC/HEIF入力は sharp が system libvips（libheif/libde265）経由でデコード
- 言語: TypeScript

## アーキテクチャ（コンポーネント構成）
本番環境（pic.handon.club）は k8s (VKE) 構成で、FluxによるGitOps管理。
同一のDockerイメージを `COMPONENT_ROLE`（`web` | `worker-front` | `compute`、未設定=ローカルall-in-one）で起動分離する3-tier。
- web: ページ＋軽量API（producer）。
- worker-front: `/api/v1/generate`・`/api/v1/post`・`/api/v1/ingest/*` を配信＋Graphile Worker consumer（bot/emailジョブ）。**sharp/skia を呼ばない**。Redis的な役割（レート制限、Workerの管理）を担っており、必ず1Pod。
- **compute**: 画像生成専用のステートレス内部サービス。外部Ingressなし、秘密情報を持たない（`COMPUTE_API_KEY` のみ）。内部API: `POST /api/internal/render`（文字入れ生成＝processImage）/ `POST /api/internal/finalize`（mime判定＋寸法＋サムネ）。worker-front は `src/lib/compute/client.ts` 経由で呼ぶ。
- `src/middleware.ts` が role でルート境界を強制（compute は `/api/internal/*`＋`/api/health` のみ／非compute は `/api/internal/*` を404）。
- 全pod の k8s probe は `/api/health`。`instrumentation.ts` が role で sharp ロードと consumer 起動をゲート。

## 入力オプション

Readme参照

## 設計上の重要なルール

### 文字配置
- **位置が上/下（横書き）**: 左揃え、画像幅に収まらない場合は改行
- **位置が左/右（縦書き）**: 上揃え、画像高さに収まらない場合は次の列へ（右から左）
- 縦書き時は句読点・括弧の回転処理あり

### フォントサイズ
- 画像の短辺基準で自動計算（横書き・縦書き共通）。基準 `Math.min(width, height) / 14`（約14文字）、下限14px・上限500px。
- サイズ係数: 小(0.75) / 中(1.0) / 大(1.4) / 特大(2.35)

### 文字の影
- 視認性のため全文字に影を追加。薄い色（白・緑・黄・桃・橙）→黒影、濃い色（赤・青・茶）→白影。

### 画像の取り扱い
- 生成画像はBlobURLで一時表示し離脱時に破棄。生成後のオプション変更で「再生成」ボタン有効化。「最初からやり直す」で全リセット。

### EXIF/メタデータ
- Orientationに従い自動回転（スマホ画像対応）。GPS・カメラ情報等は出力時に削除（プライバシー保護）。

### APIの制限
- レート制限8秒/1req（IP単位）・処理タイムアウト30秒（超過で504）・レスポンスにContent-Lengthを含む。

### RSCプリフェッチ（`?_rsc=` クエリ）
App Router の `<Link>` はビューポート進入で RSC ペイロードを自動プリフェッチし、グリッドで大量リクエストを生む。**原則すべてオプトアウト**する方針。
- `next/link` を直接 import せず必ず `import Link from "@/components/Link"`（[src/components/Link.tsx](src/components/Link.tsx)、`prefetch={false}` 既定のラッパー）を使う。ホバー/フォーカス時は先読みされるのでクリック体感は維持。
- 主要動線だけ `<Link prefetch>` でオプトイン。**同一URLは1箇所だけ** prefetch（複数だと同時発火でキャッシュミスし重複リクエスト）。
- 現在のオプトイン箇所は `/u/[username]` タブ・`/dashboard` の「あなたの情報」（同URLは1箇所に集約済み）。ヘッダー／下部ナビのメニューは共有スライドメニュー（[AppMenu.tsx](src/components/layout/AppMenu.tsx)）に統合済みで、メニュー内リンクは既定 prefetch 無効（ホバー/フォーカス先読みのみ）。

## API

### POST /api/v1/generate
- multipart/form-data。パラメータは上記「入力オプション」の API値（image/text/position/font/color/size/output）。
- **レスポンス**: image/jpeg または image/avif（バイナリ）。ヘッダー: Content-Type, Content-Length, Content-Disposition, Cache-Control。
- **エラー**: `{ success: false, error: { code, message, suggestion?, requestId? } }`

### POST /api/v1/post
- multipart/form-data・**認証必須**（JWT）。
- パラメータ: image(生成済Blob), text, position/font/color/size/output（生成オプション）, mimeType, visibility(`public`/`unlisted`/`local`)。
- **処理**: R2アップロード → DB保存 → Fediverse投稿（local時はスキップ）。
- **レスポンス**: `{ success, imageId, imagePageUrl, postUrl? }`

### POST /api/v1/ingest/email（内部API・worker-front配信）
- Cloudflare Email Workerから転送されたraw emailを処理（元画像をR2一時領域へ置き、生成〜投稿は consumer へ enqueue）。`X-API-Key` 認証・`X-Email-Prefix` でユーザー特定。
- 件名→オプション、本文→テキスト、添付→画像。デフォルトは「件名指定 > ユーザー設定 > ハードコード」。出力形式は連携インスタンスで自動決定。source: "email"。詳細は「メール投稿機能」参照。

### GET/POST/DELETE /api/v1/images/[id]/favorite
- **GET**（認証不要）: `{ favoriteCount, isFavorited, recentFavoriters[] }`
- **POST**（認証必須）: `{ success, favoriteCount, isFavorited: true }`
- **DELETE**（認証必須）: `{ success, favoriteCount, isFavorited: false }`

#### お気に入りの実体（Mastodon連携）
お気に入りは独自DBレコードではなく**Mastodonの favourite そのもの**。正データはオーナー（投稿者）インスタンス側にあり、サービスは `favoriteCount`/`favoritersCache`（上位40件）をキャッシュ保持。対象はMastodonユーザー＋`postId`あり（`isFavoritable`）。実装は [favorite.ts](src/lib/fediverse/favorite.ts) と [route.ts](src/app/api/v1/images/[id]/favorite/route.ts)（search解決・TTL値・タイムアウト・エラー分類・楽観表示の詳細はコード内コメント参照）。要点と**設計上の割り切り**:
- 読み取り（count/favourited_by）はオーナートークン、操作（POST/DELETE）はviewerトークン。別インスタンスは `postUrl` を `/api/v2/search?resolve=true` で毎回解決してから favourite（localStatusId は**キャッシュしない**割り切り。負荷化したら `(viewerInstanceDomain, postId)→localStatusId` キャッシュが有効だが現時点不要）。
- GETは**TTL切れ時のみ**オーナーsync。TTLは前回status（4xx=1日/5xx=1時間/成功=投稿経過時間ベースで可変）。POST/DELETE成功時は即時sync。
- 楽観表示はDBに保存しないため、リロードするとオーナーsyncが連合反映を持ってくるまで一旦消える（federation遅延＋上位40件の壁による割り切り）。

### GET /api/v1/favorites（認証必須）
- パラメータ cursor, limit。レスポンス `{ images[], nextCursor, hasMore }`。自分のお気に入り一覧を最新順で取得。

### GET /api/v1/public/users/[username]/calendar
- パラメータ year, month。レスポンスは `days`（日ごとの件数＋最新画像）と `hasPrevMonth`/`hasNextMonth`/`isPerfectAttendance`（皆勤賞）を含むカレンダー用月別データ。

## メール投稿機能
- **Cloudflare Email Worker** (`workers/email-forwarder/`): メールを受信しraw dataをAPIへ転送。
- **パーサー** (`src/lib/email/parser.ts`): 件名→オプション、本文→テキスト、添付→画像。
- **件名オプション**（スペース区切り・日本語キーワード。値は「入力オプション」表に対応）:
  - 位置: 上/下/左/右 ・ 色: 白/赤/青/緑/黄/茶/桃/橙 ・ サイズ: 小/中/大/特大 ・ フォント: ふい字/ゴシック/ラノベ ・ アレンジ: ネオン/ハンコ
  - 公開範囲: public/unlisted（localは件名指定不可・ユーザー設定からのみ）
  - カメラ機種: カメラ（保存）/カメラなし（保存しない）
  - 位置情報（**メール投稿のみ**）: 都道府県/市町村（EXIFのGPSから逆ジオコーディングして保存）
- **デフォルト**: 未指定はユーザーのWeb初期設定（`defaultPosition`/`defaultVisibility`/`defaultCameraOption` 等）→ 無ければハードコード（優先順位: 件名 > ユーザー設定 > フォールバック）。
- **撮影情報**: サーバー側でEXIF解析。カメラ機種は `cameraOption` が `"show"` のときのみ保存。撮影場所は件名コマンド指定時のみ保存（GPS座標自体は保存しない）。

## Bot投稿機能（メンション投稿）
Mastodon上でBotにメンションして画像生成・投稿する機能。

### 仕組み
- **Botアカウント**: `@movapic@handon.club`（環境変数で設定可能）。
- **フロー**: ①画像付きメンション受信 → ②通知取得（主: Streaming API WebSocket `src/lib/mention/streamer.ts`／フォールバック: ポーリング `fetcher.ts`・`ingest.ts` で取りこぼし補完）→ ③パース `parser.ts` → ④画像処理・投稿 `processor.ts` → ⑤元投稿削除しユーザーアカウントで再投稿 → ⑥DB保存（source: "mention"）。

### コマンド形式
`@movapic [オプション] テキスト`（`[...]` 内にスペース区切り）
- オプション値はメール投稿と同じ（位置/色/サイズ/フォント/アレンジ）。公開範囲 public/unlisted（未指定はユーザー設定）。
- 特殊: `debug`（開始・完了をBotがリプライ通知）/ `keep`（元投稿を削除せず保持）。
- 例: `@movapic [上 赤 大] こんにちは` / `@movapic [下 ネオン debug] テスト` / `@movapic [keep unlisted] 元投稿を残す`

### 制約・出力
- 画像1枚のみ（動画・GIF不可）・テキスト1〜140文字・ユーザーは事前ログイン必須・リトライ最大2回（失敗時Botがリプライ通知）。
- 出力形式は連携インスタンスで自動決定（Mastodon/Misskey ともAVIF）。
- 環境変数: `MASTODON_BOT_INSTANCE_URL` / `MASTODON_BOT_INSTANCE_DOMAIN` / `MASTODON_BOT_ACCESS_TOKEN` / `MASTODON_BOT_ACCT`。

## 投稿ソース（source）
DBの`Image.source`で投稿元を識別: `web`(🌐 Web投稿) / `email`(📧 メール投稿) / `mention`(🤖 Bot投稿)。

## 公開範囲（Visibility）
| 値 | 表示名 | Fediverse投稿 | サービス保存 | 公開TL表示 |
|----|--------|---------------|--------------|------------|
| `public` | 公開 | 公開投稿 | ✅ | ✅ |
| `unlisted` | 非収載 | 非収載（Misskey: home） | ✅ | ✅ |
| `local` | このサービスのみ | ❌ | ✅ | ✅ |

- Mastodon: `public`/`unlisted` をそのまま使用。Misskey: `unlisted` → `home`（非収載相当）。

## Fediverse認証
- 対応: Mastodon（OAuth 2.0）/ Misskey（MiAuth）。インスタンス検出はnodeinfoで自動判定。セッションはJWT（7日・httpOnly Cookie）。
- **API**: `POST /api/auth/fediverse/register`（サーバー名から種別判定し認可URL返却）/ `GET .../callback/mastodon` / `GET .../callback/misskey` / `POST /api/auth/logout`。
- **フロー**: サーバー名入力 → register（Mastodonは動的クライアント登録、Misskeyは MiAuthセッション生成）→ 認可画面 → コールバックでトークン取得 → ユーザー作成/更新 → JWT発行。

## カレンダー機能
- 月別カレンダー表示（投稿日にサムネイル）。日付クリックでその日の全画像をモーダル表示。**皆勤賞**: その月毎日投稿で👑（過去月のみ判定）。
- **サムネイル**: 128x128px WebP・quality 80。投稿時（`/api/v1/post`内）に生成。クロップ位置は文字位置に応じた角基準（top/left→左上、bottom→左下、right→右上）。既存画像は `npx tsx scripts/generate-thumbnails.ts`。

## 実績・通知機能
- ユーザーページの「実績」タブ（誰でも閲覧可）＋ヘッダーのベル通知（ログインユーザーのみ）。
- 付与は「投稿した瞬間」に確定する条件のみ。web/email/mention が収束する `publishImage.ts` に1箇所フック。
- **追加・変更の手順と不変条件は [`src/lib/achievements/README.md`](src/lib/achievements/README.md) に集約**（keyは永続でリネーム禁止、しきい値は `>=`、live と backfill の集計を必ず同期 等）。
- 既存ユーザーへの反映: `DATABASE_URL=... npx tsx scripts/backfill-achievements.ts`（冪等）。

## PWA対応
ホーム画面追加対応のPWA。Push通知は**やらない**。
- **インストール**: 静的 [manifest.json](public/manifest.json)（`display: standalone`）。アイコンは `npx tsx scripts/generate-pwa-icons.ts` で生成（`public/icons/`、any/maskable/apple-touch）。metadata（manifest/appleWebApp/viewport）は [layout.tsx](src/app/layout.tsx)。
- **Share Target（簡単投稿）**: 他アプリ共有メニュー → manifest `share_target`（`POST /share-target`）→ 最小SW [sw.js](public/sw.js) が画像をCache Storageへ保存し `/create?shared=1` へ303 → [CreateClient.tsx](src/app/create/CreateClient.tsx) がマウント時に取り出し `handleImageSelect` へ。SWはこの用途のみ（オフラインキャッシュなし。登録は [ServiceWorkerRegister.tsx](src/components/ServiceWorkerRegister.tsx)）。**iOS Safari の PWA では共有受信不可**（仕様上。インストール・下部メニューは動作）。
- **下部メニューバー（standalone時のみ）**: [BottomNav.tsx](src/components/layout/BottomNav.tsx)。みんな/同じサーバー/投稿(中央強調)/マイページ/メニュー。未ログイン時はログイン必須項目を非表示。表示情報はDBレスな `getSessionClaims()` から layout で取得。
- **standalone判定はCSSのみ**（JS不使用でハイドレーション不整合を回避）: [globals.css](src/app/globals.css) の `@custom-variant standalone`。BottomNavは `standalone:flex`、[FloatingPostButton](src/components/FloatingPostButton.tsx) は `standalone:hidden`、[SiteHeader](src/components/layout/SiteHeader.tsx) は `standalone:sticky`。
- layout で cookie を読むため全ページが動的レンダリング（認証中心アプリのため許容）。

## HEIC対応

prebuilt の `@img/sharp-*` は HEVC（HEIC）非対応のため、**system libvips に対し sharp をソースビルド**して使う。仕組み・依存・各踏み抜きはコメント参照:
- ビルド: postinstall [scripts/use-system-libvips.mjs](scripts/use-system-libvips.mjs)（mac は事前に `brew install vips`）
- ネイティブ依存（build/runtime の apk パッケージ）: [Dockerfile](Dockerfile) のコメント
- デコード処理（iref 制限の `unlimited`・HEIF→JPEG化）: [rotate.ts](src/lib/image/rotate.ts)

やってはいけない:
- `.npmrc` の `omit=optional` で prebuilt を消す（lightningcss 等の native optional も巻き込み dev/build が壊れる）。sharp の `@img` だけ postinstall で除去する。
- `heic-convert` の再導入（純JS/WASMで遅く生成が504タイムアウトしたため廃止。commit `aec8325`）。

## 本番DBマイグレーション

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```
