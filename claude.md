# 画像文字入れサービス / SHAMEZO

- 全て日本語で回答。
- 本番環境でも実行するコマンド（DBマイグレーション、バックフィルスクリプトなど）は、手順確認も兼ね、必ずユーザーが実行する。検証環境であっても、勝手にやらない。
- 上記にかかわらず、値の確認や値を変更しないコマンドは勝手にやる。Prisma クライアントの再生成は勝手にやる。
- 勝手に git コミットしない。
- リバート時は git コマンドを使わず、ファイルをひとつひとつ修正。
- 問題は常に root cause を調べ、直接解決する。フォールバック処理を作ってごまかさない。原因がわからない、または実害があるかわからない段階で「念のため」の処理を作らない。
- コメントにはWhat/HowでなくWhyを残す。ただし、過去の pitfall および対策内容は残す。

## 概要
画像に文字（コメント）を入れて生成し、Fediverseに同時投稿するWebアプリ。昔の携帯百景。
入力オプションの各値・文字レンダリングの概要は [README](README.md) 参照。

## 技術スタック
- フレームワーク: Next.js 16 (App Router) / UI: Tailwind CSS + shadcn/ui / 言語: TypeScript
- 画像処理: sharp + skia-canvas（サーバーサイド）。HEIC/HEIF入力は sharp が system libvips（libheif/libde265）経由でデコード

## ページ名称
- `/` → トップページ
- `/dashboard` → メニュー／ダッシュボード
- `/create` → 投稿ページ
- `/u/[username]` → ユーザーページ（`/calendar` カレンダー・`/achievements` 実績・`/status/[imageId]` 画像詳細）
- `/public` → 公開タイムライン
- `/favorite` → お気に入り

## ドキュメント索引
必要になった領域を触るときに読む。CLAUDE.md には常時必要な要点のみ記載。

| ドキュメント | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 3-tier構成（web/worker-front/compute）・ルート境界・ヘルスチェック・**HEIC/sharpソースビルド**・本番DBマイグレーション |
| [docs/api.md](docs/api.md) | 各APIエンドポイント（generate / post / ingest/email / favorite / calendar 等） |
| [docs/posting.md](docs/posting.md) | メール投稿・Bot（メンション）投稿・投稿ソース(source)・公開範囲(visibility) |
| [docs/ui.md](docs/ui.md) | レスポンシブ(PC/モバイル)・ボタンカラー(primary/brand)・共通セレクター(SegmentControl)・画像リトライ表示 |
| [docs/text-rendering.md](docs/text-rendering.md) | 文字配置・フォントサイズ・影・EXIF・代替テキスト(ALT)の配管 |
| [docs/features.md](docs/features.md) | Fediverse認証・カレンダー・実績/通知・PWA |
| [docs/favorite.md](docs/favorite.md) | お気に入り（Mastodon favourite連携）のTTL・定期同期など全仕様 |
| [docs/periodic-jobs.md](docs/periodic-jobs.md) | 定期ジョブ（graphile-worker crontab内蔵の30分毎メンテ） |
| [docs/SETUP.md](docs/SETUP.md) | 環境構築 |
| [src/lib/achievements/README.md](src/lib/achievements/README.md) | 実績の追加手順・不変条件 |

## 常に守るルール

### アーキテクチャの境界（詳細: [docs/architecture.md](docs/architecture.md)）
- 同一イメージを `COMPONENT_ROLE`（`web`｜`worker-front`｜`compute`、未設定=ローカルall-in-one）で起動分離。
- **worker-front は sharp/skia を呼ばない**（必ず1Pod）。画像生成は compute の内部API（render/finalize）へ委譲。
- Next standalone は全ルートをboot評価するため、**画像処理ルートは sharp/skia を handler内 dynamic import 必須**（非画像podで常駐させない）。

### UI（詳細: [docs/ui.md](docs/ui.md)）
- **レスポンシブ**: PC/モバイルは同一ページで別レイアウト。境界は `md`（768px）、判定は原則CSSのみ。PCは右レール（`md:pr-[60px]`＝`RAIL_COLLAPSED`と一致）・モバイル/standaloneは下部ナビ。ページ幅は `container mx-auto px-4 max-w-6xl`。
- **ボタンカラー**: `primary`（neutral黒/白＝一般ボタン。shadcn既定）と `brand`（ピンク＝主役CTAのみ）を区別。迷ったら primary。
- **共通セレクター**: 選択トグルは必ず [SegmentControl.tsx](src/components/SegmentControl.tsx) を使う（手書き複製禁止）。ドロップダウン `ui/select` は基本使わない。
- **画像表示**: 原本表示は [RetryImage](src/components/gallery/RetryImage.tsx)、アバター等の小画像は [RetryImg](src/components/RetryImg.tsx)（iOS一過性失敗を同一URLで最大2回リトライ・バスター禁止・失敗時は灰プレースホルダ）。サムネは不要。

### 文字配置・生成（詳細: [docs/text-rendering.md](docs/text-rendering.md)）
- 位置 上/下＝横書き左揃え・幅超過で改行。左/右＝縦書き上揃え・高さ超過で次列（右→左）。縦書きは句読点/括弧の回転あり。
- フォントサイズは短辺 `Math.min(w,h)/14` 基準・下限14/上限500px、係数 小0.75/中1.0/大1.4/特大2.35。
- 全文字に影（薄色→黒影・濃色→白影）。EXIF Orientationで自動回転し、出力時にGPS/カメラ等メタは削除。
- 代替テキスト(ALT)は `altText` を1本の配管で通す（`/api/v1/generate`には送らず`/api/v1/post`のFormDataのみ）。

### API（詳細: [docs/api.md](docs/api.md)）
- レート制限: プレビュー生成(`/api/v1/generate`)はIP単位のスライディングウィンドウ（[rateLimit.ts](src/lib/rateLimit.ts)）、投稿(`/api/v1/post`)はユーザー単位でDB履歴ベース（[postRateLimit.ts](src/lib/postRateLimit.ts)・15分/24時間の2窓、24時間は直近1週間の投稿数で上限が上がる）。閾値定数は将来env切り出し予定。処理タイムアウト30秒（超過で504）・レスポンスにContent-Lengthを含む。
- エラー形式は `{ success:false, error:{ code, message, suggestion?, requestId? } }`。

### テスト / CI
- **Vitest**（`environment: node`・`globals: true`・alias `@`＝[vitest.config.ts](vitest.config.ts)）。テストは対象と**同じ階層に併置**（`src/**/foo.ts` → `src/**/foo.test.ts`）。書式は `describe`/`it`/`expect`、`it` の説明は日本語。
- **対象は純粋ロジック（`src/lib/**`）と API ルート（`src/app/api/**`）**。IO/インフラ層（db/compute/storage/queue/periodic/pwa/bot/fonts）はモックコスト過多で**unit対象外と割り切る**。
- **画像の実描画はunitで呼ばない**。`overlay/stamp/neon/rotate/format/fonts/seasons/calendarCollage` は skia 実描画が要るため **ゴールデン画像テスト**（`*.golden.test.ts`）で別建て。実行は本番同一Dockerでのみ（`npm run test:golden`）。通常CIからは除外。
- **APIルートのテスト**: 境界（DB/ストレージ/Fediverse/compute/逆ジオコーディング等）を先頭で `vi.mock` して外部を一切読ませず、`import { POST } from "./route"` → `vi.mocked()` で型付きに扱う（例: [post/route.test.ts](src/app/api/v1/post/route.test.ts)）。
- **CI**（[ci.yml](.github/workflows/ci.yml)→[checks.yml](.github/workflows/checks.yml)）: 全ブランチpushで vitest → eslint → tsc。`npm ci --ignore-scripts`（sharp/skiaのネイティブビルドをスキップ）＋`prisma generate` で回すため、**unitテストが sharp/skia を import すると CI が壊れる**（純粋ロジックのみに保つ）。
- ローカルは `npm test`（=`vitest run`）／`npm run test:watch`／`npm run test:coverage`。**変更後は `npm test`・`npm run lint`・`npm run typecheck` を通す**。カバレッジ母数は lib＋api（実描画・インフラは意図的に除外し「本当の穴」だけ可視化）。

### RSCプリフェッチ（`?_rsc=` クエリ）
App Router の `<Link>` はビューポート進入で RSC ペイロードを自動プリフェッチし、グリッドで大量リクエストを生む。**原則すべてオプトアウト**する。
- `next/link` を直接 import せず必ず `import Link from "@/components/Link"`（[Link.tsx](src/components/Link.tsx)、`prefetch={false}` 既定のラッパー）を使う。ホバー/フォーカスで先読みされるのでクリック体感は維持。
- 主要動線だけ `<Link prefetch>` でオプトイン。**同一URLは1箇所だけ** prefetch（複数だと同時発火でキャッシュミスし重複リクエスト）。
- 現在のオプトイン箇所は `/u/[username]` タブ・`/dashboard` の「あなたの情報」。メニューは共有スライドメニュー（[AppMenu.tsx](src/components/layout/AppMenu.tsx)）に統合済みで既定 prefetch 無効。

### タイムライン更新（reconcile / PTR / 画像キャッシュ）
一覧（`/public`・同じサーバー・`/favorite`・`/u/[username]/photos`）は共通フック [useInfiniteImages.ts](src/hooks/useInfiniteImages.ts)。
- 更新は **reconcile 型**（最新ページで head を作り直し・古い tail は維持）。prepend だと削除/編集が消えず残るため。ロジックは [`reconcileTimeline`](src/lib/pagination.ts)。永続化は [useTimelinePersistence.ts](src/hooks/useTimelinePersistence.ts)（sessionStorage・復元後 reconcile）。可視化は `.tl-enter`・「N件の新着」ピル・PTR完了✓。
- **カスタムPTR**（[PullToRefresh.tsx](src/components/PullToRefresh.tsx)・layout に1個）は **standalone PWA 限定**（iOSはネイティブPTR無し／Androidは全リロードのため自前化。タブは触らない）。一覧は `useRegisterPullToRefresh(refresh)` で in-place 更新、他ページは `location.reload`。Android ネイティブPTRは `overscroll-behavior:contain` で抑止。
- **SW画像キャッシュ**（[public/sw.js](public/sw.js)）: iOS が画像を退避し再DLするため、投稿画像をパス `/YYYY/MM/DD/` で CacheFirst（FIFO50・cors非opaque）。

### プライバシー制御
- `User.blockCrawlers` フラグで検索（noindexメタ）とAI Bot（robots.txt Disallow）をユーザー単位制御・`revalidateTag`で即反映。

### 日時
- サーバ側の「今日/今月」は必ずJST（`toJstDateString`）で判定。`new Date().getMonth()` は本番UTCで前月を返す。
