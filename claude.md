# 画像文字入れサービス (movapic-neo)

全て日本語で回答してください。

## 概要
画像に文字を入れて生成するWebアプリ。

## ページ名称
- `/` → **トップページ**
- `/dashboard` → **メニュー**
- `/create` → **投稿ページ**
- `/settings` → **設定ページ**
- `/u/[username]` → **ユーザーページ**
- `/u/[username]/calendar` → **カレンダーページ**
- `/u/[username]/status/[imageId]` → **画像ページ**
- `/public` → **公開タイムライン**
- `/favorite` → **お気に入りページ**（ログインユーザーのみ）
- `/license` → **ライセンスページ**
- `/privacy` → **プライバシーポリシー**

## 技術スタック
- **フレームワーク**: Next.js 16 (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **画像処理**: sharp + skia-canvas + heic-convert（サーバーサイド）
- **言語**: TypeScript

## アーキテクチャ（コンポーネント構成）
同一Dockerイメージを `COMPONENT_ROLE`（`web` | `worker-front` | `compute`、未設定=ローカルall-in-one）で起動分離する3-tier。
- **web**: ページ＋軽量API（producer）。
- **worker-front**: `/api/v1/generate`・`/api/v1/post`・`/api/v1/ingest/*` を配信＋Graphile Worker consumer（bot/emailジョブ）。重い画像処理は compute に委譲し**自身は sharp/skia を呼ばない**。レート制限（generate のIP単位8s/1req インメモリ）のため当面1pod。
- **compute**: 画像生成専用の**ステートレス内部サービス**。外部Ingressなし（ClusterIP＋NetworkPolicy）、秘密情報を持たない（`COMPUTE_API_KEY` のみ）。内部API: `POST /api/internal/render`（文字入れ生成＝processImage）/ `POST /api/internal/finalize`（mime判定＋寸法＋サムネ）。worker-front は `src/lib/compute/client.ts` 経由で呼ぶ。
- `src/middleware.ts` が role でルート境界を強制（compute は `/api/internal/*`＋`/api/health` のみ／非compute は `/api/internal/*` を404）。
- 全pod の k8s probe は `/api/health`。`instrumentation.ts` が role で sharp ロードと consumer 起動をゲート。

## 主な機能

### 入力
- **テキスト**: 1〜140文字（必須、空白のみは不可）
- **画像**: JPEG/PNG/WebP/HEIC/AVIF、最大20MB
- **コマンド設定**:
  - 位置: 上(default) / 右 / 左 / 下
  - フォント: ふい字(default) / Noto Sans JP / ラノベPOP
  - カラー: 白(default) / 赤 / 青 / 緑 / 黄 / 茶 / 桃 / 橙
  - サイズ: 中(default) / 大 / 小 / 特大
  - 出力形式: Mastodon(AVIF) / Misskey(AVIF) / なし(JPEG)

### 出力
- 文字入れ済み画像（JPEG or AVIF）
- 生成後に画像情報を表示（サイズ × 高さ / 形式 / ファイルサイズ）
- ダウンロードボタンで保存

## 設計上の重要なルール

### 文字配置
- **位置が上/下（横書き）**: 左揃え、画像幅に収まらない場合は改行
- **位置が左/右（縦書き）**: 上揃え、画像高さに収まらない場合は次の列へ（右から左）
- 縦書き時は句読点・括弧の回転処理あり

### フォントサイズ
- 画像の短辺を基準に自動計算（横書き・縦書き共通）
  - 基準サイズ: `Math.min(width, height) / 14`（約14文字入る大きさ）
  - 下限14px、上限500px
- サイズ係数: 小(0.75) / 中(1.0) / 大(1.4) / 特大(2.35)

### 文字の影
- 視認性向上のため、全ての文字に影を追加
- 薄い色（白、緑、黄、桃、橙）→ 黒い影
- 濃い色（赤、青、茶）→ 白い影

### 画像の取り扱い
- 生成画像はBlobURLで一時的に表示し、ページ離脱時に破棄
- 生成後にオプションを変更すると「画像を再生成」ボタンが有効化される
- 「最初からやり直す」ボタンで画像・テキスト・オプション全てをリセット

### EXIF/メタデータ
- Orientationタグに従い自動回転（スマホ画像対応）
- GPS・カメラ情報等のメタデータは出力時に削除（プライバシー保護）

### APIの制限
- レート制限: 8秒間に1リクエスト（IPアドレス単位）
- 処理タイムアウト: 30秒（超過時は504エラー）
- レスポンスにContent-Lengthヘッダーを含む

### RSCプリフェッチ（`?_rsc=` クエリ）
App Router の `<Link>` はビューポート進入で対象ルートの RSC ペイロード（`?_rsc=...` 付き fetch）を自動プリフェッチする。画像カードのグリッド等で1ページ数十件のリクエストが発生したため、**原則すべてのプリフェッチをオプトアウト**する方針。
- `next/link` を直接 import せず、必ず `import Link from "@/components/Link"`（[src/components/Link.tsx](src/components/Link.tsx)）を使う。これは `prefetch={false}` を既定にした素の転送ラッパー。`prefetch={false}` でもホバー/フォーカス時は先読みされるのでクリック体感は維持される。
- **明示的に先読みしたい主要動線だけ** `<Link href=... prefetch>` でオプトイン。
- プリフェッチは遷移先URLをキーに Router Cache へ入るため、**同一URLは1箇所だけ `prefetch` すれば十分**（ページ内の他の同URLリンクもキャッシュを再利用）。逆に**同じURLを複数の `<Link prefetch>` で持つと、各リンクがマウント時に同時発火してキャッシュミスし、同一ページへ `?_rsc=` リクエストが重複して飛ぶ**ので避ける。
- 現在オプトイン済みの箇所: SiteHeaderのハンバーガーメニュー（`/dashboard`・`/create`・`/public`・`/public?instances=...`）、`/u/[username]` のタブ（一覧/カレンダー/地図/実績）、`/dashboard` の「あなたの情報」セクション内のLink（アバター＋4スタットボタン＋人気投稿。`/u/[selfSeg]` への prefetch はスタットボタン側1箇所に集約し、アバターは prefetch なし）。

## API

### POST /api/v1/generate
- **Content-Type**: multipart/form-data
- **パラメータ**:
  - image: File
  - text: string（1〜140文字、空白のみ不可）
  - position: "top" | "right" | "left" | "bottom"
  - font: "hui-font" | "noto-sans-jp" | "light-novel-pop"
  - color: "white" | "red" | "blue" | "green" | "yellow" | "brown" | "pink" | "orange"
  - size: "small" | "medium" | "large" | "extra-large"
  - output: "mastodon" | "misskey" | "none"
- **レスポンス**: image/jpeg または image/avif（バイナリ）
- **レスポンスヘッダー**: Content-Type, Content-Length, Content-Disposition, Cache-Control
- **エラーレスポンス**: `{ success: false, error: { code, message, suggestion?, requestId? } }`

### POST /api/v1/post
- **Content-Type**: multipart/form-data
- **認証**: 必須（JWTセッション）
- **パラメータ**:
  - image: Blob（生成済み画像）
  - text: string
  - position / font / color / size / output: 生成オプション
  - mimeType: string
  - visibility: "public" | "unlisted" | "local"
- **処理**: R2アップロード → DB保存 → Fediverse投稿（localの場合はスキップ）
- **レスポンス**: `{ success, imageId, imagePageUrl, postUrl? }`

### POST /api/v1/ingest/email（内部API）
- worker-front が配信。
- Cloudflare Email Workerから転送されたraw emailを処理（元画像をR2一時領域へ置き、生成〜投稿は worker(consumer) へ enqueue）
- `X-API-Key`ヘッダーで認証、`X-Email-Prefix`でユーザー特定
- 件名からオプション解析（例: "上 赤 大"）、本文がテキスト、添付が画像
- オプション・公開範囲のデフォルトはユーザーのWeb初期設定を使用（件名指定 > ユーザー設定 > ハードコード）
- カメラ機種・撮影場所をEXIFから保存（詳細は「メール投稿機能」セクション参照）
- 出力形式はユーザーの連携インスタンス（Mastodon/Misskey）で自動決定
- 生成画像はR2にアップロード、メタデータはDBに保存（source: "email"）

### GET/POST/DELETE /api/v1/images/[id]/favorite
- **GET**: お気に入り状態取得（認証不要）
  - レスポンス: `{ favoriteCount, isFavorited, recentFavoriters[] }`
- **POST**: お気に入り登録（認証必須）
  - レスポンス: `{ success, favoriteCount, isFavorited: true }`
- **DELETE**: お気に入り解除（認証必須）
  - レスポンス: `{ success, favoriteCount, isFavorited: false }`

#### お気に入りの実体（Mastodon連携）
お気に入りは**サービス独自のDBレコードではなく、Mastodonの favourite そのもの**。正データはオーナー（投稿者）インスタンス側にあり、サービスは `favoriteCount` / `favoritersCache`（上位40件）をキャッシュとして保持する。実装は [src/lib/fediverse/favorite.ts](src/lib/fediverse/favorite.ts) と [src/app/api/v1/images/[id]/favorite/route.ts](src/app/api/v1/images/[id]/favorite/route.ts)。Mastodonユーザー＋`postId`がある投稿のみ対象（`isFavoritable`）。

- **読み取り（count / favourited_by）**: オーナーのトークンでオーナーインスタンスから取得。
- **お気に入り操作（POST/DELETE）**: viewer（操作者）のトークンで実行。
  - **同一インスタンス**（viewer == owner）: `postId` をそのまま使う（search不要）。
  - **別インスタンス**（viewer != owner）: viewer側に振られたローカルstatus IDが必要。`postUrl` を keyに **`/api/v2/search?resolve=true`（viewerトークン）で毎操作ごとに解決**してから `POST /statuses/:id/favourite`。解決結果（localStatusId）は**キャッシュしていない**（現状の意図的な割り切り）。
    - localStatusId は (viewerインスタンス × 投稿) で一意かつそのインスタンスの全ユーザー共通なので、search負荷が問題化したら `(viewerInstanceDomain, postId) → localStatusId` のキャッシュ導入が有効。**現時点では不要と判断**。
    - resolve（federation取得を伴い遅い）だけ専用タイムアウト10秒（`RESOLVE_TIMEOUT`）、他の読み取り・操作は4秒（`SHORT_TIMEOUT`）。
    - `authorize_interaction`（[画像ページ](src/app/u/[username]/status/[imageId]/page.tsx)の「返信/インタラクション」リンクで使用）は**ブラウザをviewerインスタンスUIへ飛ばす対話フロー**で、トークンでの非対話お気に入りには使えない。サーバー側ワンクリックは search 経由が標準。
- **楽観表示**: POST/DELETE成功時、レスポンスの favoriters一覧に viewer自身を仮追加/除外する（[route.ts](src/app/api/v1/images/[id]/favorite/route.ts) `mergeViewerFavoriter`）。**DBキャッシュには保存しない**ため、リロードするとオーナー側syncが本物の連合反映を持ってくるまで一旦消える（federation遅延＋上位40件の壁による割り切り）。
- **エラー分類**（`FavoriteErrorReason`）: `deleted`(404/410) / `forbidden`(401/403→再ログイン誘導) / `unavailable`(5xx・タイムアウト) / `unresolved`（search成功だが該当statusなし＝**未伝播**。「削除」ではなく「未反映なので時間をおいて」と案内）。

#### お気に入りキャッシュの更新頻度（TTL）
GET時に**TTL切れ（または未取得）のときだけ**オーナートークンでMastodonへsyncする（`computeCacheTtl`）。連打・人気投稿でのアクセス集中を抑えるため、投稿経過時間と前回のpostStatusでTTLを可変にする。
- 直近のsyncが **4xx**: 1日（削除確定・権限不足など、再試行の意味が薄い）
- **5xx / 接続失敗(0)**: 1時間
- **成功(200) / 未sync**: 投稿経過時間ベース（≤5分: 1分 / ≤2時間: 5分 / ≤1日: 30分 / ≤5日: 1時間 / それ以降: 1日）
- POST/DELETE成功時は即時にオーナー側syncを1回走らせてキャッシュを更新する。

### GET /api/v1/favorites
- **認証**: 必須
- **パラメータ**: cursor, limit
- **レスポンス**: `{ images[], nextCursor, hasMore }`
- 自分がお気に入り登録した画像一覧を最新順で取得

### GET /api/v1/public/users/[username]/calendar
- **パラメータ**: year, month
- **レスポンス**:
  ```typescript
  {
    year: number
    month: number
    days: { [day: number]: { count, latest: { id, thumbnailKey, storageKey, position } } }
    hasPrevMonth: boolean
    hasNextMonth: boolean
    isPerfectAttendance: boolean  // 皆勤賞（その月毎日投稿）
  }
  ```
- カレンダー表示用の月別画像データ

## メール投稿機能
- **Cloudflare Email Worker** (`workers/email-forwarder/`): メールを受信しraw dataをAPIへ転送
- **メールパーサー** (`src/lib/email/parser.ts`): 件名→オプション、本文→テキスト、添付→画像
- **オプション指定**: 件名にスペース区切りで日本語キーワード
  - 位置: 上/下/左/右
  - 色: 白/赤/青/緑/黄/茶/桃/橙
  - サイズ: 小/中/大/特大
  - フォント: ふい字/ゴシック/ラノベ
  - アレンジ: ネオン/ハンコ
  - 公開範囲: public/unlisted（Bot投稿と共通。localは件名指定不可、ユーザー設定からのみ）
  - カメラ機種: カメラ（保存する）/カメラなし（保存しない）
  - 位置情報（メール投稿のみ）: 都道府県/市町村（EXIFのGPSから逆ジオコーディングして保存）
- **デフォルト値**: 件名で未指定のオプションはユーザーのWeb初期設定（`defaultPosition`/`defaultVisibility`/`defaultCameraOption`等）を使用し、それも未設定ならハードコードのデフォルト（優先順位: 件名 > ユーザー設定 > フォールバック）
- **撮影情報（EXIF）**: サーバー側で元画像を解析。カメラ機種は解決後の`cameraOption`が`"show"`のときのみ保存。撮影場所は件名コマンド指定時のみ保存（GPS座標自体は保存しない）

## Bot投稿機能（メンション投稿）
Mastodon上でBotアカウントにメンションすることで画像生成・投稿を行う機能。

### 仕組み
- **Botアカウント**: `@movapic@handon.club`（環境変数で設定可能）
- **処理フロー**:
  1. ユーザーがBotに画像付きメンションを送信
  2. Botが通知を取得（主経路: Mastodon Streaming API による WebSocket 即時受信 `src/lib/mention/streamer.ts`／フォールバック: 定期ポーリング `src/lib/mention/fetcher.ts`・`ingest.ts`。切断・サイレント切断時の取りこぼしを補完）
  3. メンション内容をパース（`src/lib/mention/parser.ts`）
  4. 画像処理・投稿を実行（`src/lib/mention/processor.ts`）
  5. 元投稿を削除し、処理済み画像をユーザーのアカウントで再投稿
  6. DBに保存（source: "mention"）

### コマンド形式
```
@movapic [オプション] テキスト
```

### オプション指定（`[...]`内にスペース区切り）
- **位置**: 上/下/左/右
- **色**: 白/赤/青/緑/黄/茶/桃/橙
- **サイズ**: 小/中/大/特大
- **フォント**: ふい字/ゴシック/ラノベ
- **アレンジ**: ネオン/ハンコ
- **公開範囲**: public/unlisted（指定なしの場合はユーザー設定を使用）
- **特殊コマンド**:
  - `debug`: 処理開始・完了時にBotからリプライで通知
  - `keep`: 元投稿を削除せずに保持

### 例
```
@movapic [上 赤 大] こんにちは
@movapic [下 ネオン debug] テスト投稿
@movapic [keep unlisted] 元投稿を残す
```

### 制約
- 画像は1枚のみ添付可能（動画・GIF不可）
- テキストは1〜140文字
- ユーザーは事前にサービスにログイン済みである必要がある
- リトライは最大2回まで、失敗時はBotがリプライでエラー通知

### 出力形式
ユーザーの連携インスタンスに基づいて自動決定：
- Mastodonユーザー → AVIF（Mastodon形式）
- Misskeyユーザー → AVIF（Misskey形式）

### 環境変数
- `MASTODON_BOT_INSTANCE_URL`: BotインスタンスのURL（例: `https://handon.club`）
- `MASTODON_BOT_INSTANCE_DOMAIN`: Botインスタンスのドメイン（例: `handon.club`）
- `MASTODON_BOT_ACCESS_TOKEN`: Botのアクセストークン
- `MASTODON_BOT_ACCT`: Botのアカウント名（例: `movapic`）

## 投稿ソース（source）
DBの`Image.source`フィールドで投稿元を識別：

| 値 | 説明 | 画像ページ表示 |
|----|------|----------------|
| `web` | Web投稿ページから投稿 | 🌐 Web投稿 |
| `email` | メール経由で投稿 | 📧 メール投稿 |
| `mention` | Bot（メンション）経由で投稿 | 🤖 Bot投稿 |

## 公開範囲（Visibility）
投稿時に選択可能な公開範囲：

| 値 | 表示名 | Fediverse投稿 | サービス保存 | 公開TL表示 |
|----|--------|---------------|--------------|------------|
| `public` | 公開 | 公開投稿 | ✅ | ✅ |
| `unlisted` | 非収載 | 非収載投稿（Misskey: home） | ✅ | ✅ |
| `local` | このサービスのみ | ❌ | ✅ | ✅ |

- Mastodon: `public` / `unlisted` をそのまま使用
- Misskey: `unlisted` → `home` に変換（Misskeyの「ホーム」が非収載相当）

## Fediverse認証
- **対応プラットフォーム**: Mastodon（OAuth 2.0）/ Misskey（MiAuth）
- **インスタンス検出**: nodeinfo取得で自動判定
- **セッション**: JWT（7日間有効）、httpOnly Cookie

### 認証API
- **POST /api/auth/fediverse/register**: 認証開始（サーバー名から自動でMastodon/Misskeyを判定し認可URLを返す）
- **GET /api/auth/fediverse/callback/mastodon**: Mastodon OAuthコールバック
- **GET /api/auth/fediverse/callback/misskey**: Misskey MiAuthコールバック
- **POST /api/auth/logout**: ログアウト（Cookie削除）

### 認証フロー
1. ユーザーがサーバー名を入力 → `/api/auth/fediverse/register`
2. Mastodon: 動的クライアント登録 → OAuth認可画面へリダイレクト
3. Misskey: MiAuthセッション生成 → MiAuth認可画面へリダイレクト
4. コールバックでトークン取得 → ユーザー作成/更新 → JWTセッション発行

## カレンダー機能
ユーザーページから閲覧できる投稿カレンダー。

### 機能
- 月別カレンダー表示（投稿日にサムネイル表示）
- 日付クリックでその日の全画像をモーダル表示
- **皆勤賞**: その月に毎日投稿すると👑を表示（過去月のみ判定）

### サムネイル
- **サイズ**: 128x128px（WebP形式、quality 80）
- **生成タイミング**: 投稿時（`/api/v1/post`内）
- **クロップ位置**: 文字位置に応じた角を基準
  - top/left → 左上から
  - bottom → 左下から
  - right → 右上から
- **既存画像のサムネイル生成**: `npx tsx scripts/generate-thumbnails.ts`

## 実績・通知機能
- ユーザーページの「実績」タブ（誰でも閲覧可）と、ヘッダーのベル通知（ログインユーザーのみ）。
- 付与は「投稿した瞬間」に確定する条件のみ。web/email/mention の3経路すべてが収束する `publishImage.ts` に1箇所フック。
- **実績を追加・変更する手順と不変条件は [`src/lib/achievements/README.md`](src/lib/achievements/README.md) に集約**（key は永続でリネーム禁止、しきい値は `>=`、live と backfill の集計を必ず同期、等）。
- 既存ユーザーへの反映: `DATABASE_URL=... npx tsx scripts/backfill-achievements.ts`（冪等）。

## PWA対応
ホーム画面に追加できるPWA。Push通知は**やらない**。

- **インストール**: 静的 [public/manifest.json](public/manifest.json)（`display: standalone`）。アイコンはロゴと同じグラデーション／ケータイアイコンを流用しつつ、正方形向けに「SHAME ／ ZO📱」の**2行レイアウト**を [scripts/generate-pwa-icons.ts](scripts/generate-pwa-icons.ts) 内のSVGで組み、白背景に合成して生成（`npx tsx scripts/generate-pwa-icons.ts` → `public/icons/`、any/maskable/apple-touch）。manifest/appleWebApp/viewport(`viewportFit: cover`) は [src/app/layout.tsx](src/app/layout.tsx) の metadata で付与。
- **Share Target（簡単投稿）**: 他アプリの共有メニューから画像を受け取り投稿ページへ載せる。manifest の `share_target`（`POST /share-target`）→ 最小の Service Worker [public/sw.js](public/sw.js) が画像を Cache Storage(`shared-image`/`/__shared`)へ保存し `/create?shared=1` へ303リダイレクト → [CreateClient.tsx](src/app/create/CreateClient.tsx) がマウント時にキャッシュから取り出し既存の `handleImageSelect` に流す。SWはこの用途のみ（オフラインキャッシュはしない）。SW登録は [src/components/ServiceWorkerRegister.tsx](src/components/ServiceWorkerRegister.tsx)。
  - **iOS制約**: Web Share Target は Android Chrome等のみ。**iOS Safari の PWA では共有受信は不可**（仕様上）。iOSでもインストール・下部メニューは動作する。
- **下部メニューバー（standalone時のみ）**: [src/components/layout/BottomNav.tsx](src/components/layout/BottomNav.tsx)。左から みんな/同じサーバー/投稿(中央・強調)/マイページ/メニュー。中央の投稿ボタンはバー上端から少しはみ出す大きめの円ボタン（`-mt-6 h-16 w-16 ring-4 ring-background`）。未ログイン時はログイン必須項目（同じサーバー・マイページ）を非表示。表示情報は DBレスな `getSessionClaims()` から layout で取得。
  - **standalone判定はJSではなくCSSのみ**: [globals.css](src/app/globals.css) に Tailwind v4 の `@custom-variant standalone (@media (display-mode: standalone))` を定義。BottomNav は `hidden standalone:flex`、従来の [FloatingPostButton](src/components/FloatingPostButton.tsx) は `standalone:hidden` でPWA時だけ隠す（ハイドレーション不整合を避ける）。body に standalone時のみ下部余白＋`safe-area-inset-bottom`。
  - **ヘッダーもPWA時のみスティッキー**: [SiteHeader](src/components/layout/SiteHeader.tsx) に `standalone:sticky standalone:top-0 standalone:z-30`。通常ブラウザでは従来どおり非固定。
  - layout で cookie を読むため全ページが動的レンダリングになる（認証中心アプリのため許容）。

## 本番DBマイグレーション

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```
