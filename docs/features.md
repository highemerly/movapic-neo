# 機能詳細（認証／カレンダー／実績／PWA）

## Fediverse認証
- 対応: Mastodon（OAuth 2.0）/ Misskey（MiAuth）。インスタンス検出はnodeinfoで自動判定。セッションはJWT（7日・httpOnly Cookie）。
- **API**: `POST /api/auth/fediverse/register`（サーバー名から種別判定し認可URL返却）/ `GET .../callback/mastodon` / `GET .../callback/misskey` / `POST /api/auth/logout`。
- **フロー**: サーバー名入力 → register（Mastodonは動的クライアント登録、Misskeyは MiAuthセッション生成）→ 認可画面 → コールバックでトークン取得 → ユーザー作成/更新 → JWT発行。
- **サーバーポリシー**（env 読み取りは [serverPolicy.ts](../src/lib/auth/serverPolicy.ts) に集約・すべて任意）:
  - `LOGIN_PLATFORM`: ログイン可能なプラットフォーム（カンマ区切り: mastodon/misskey）。未設定=両方許可。
  - `ALLOWED_SERVERS`: 許可サーバー（カンマ区切り）。未設定=全許可。
  - `DENIED_SERVERS`: 拒否サーバー（カンマ区切り）。ログイン開始のみ弾き、既存アカウント・セッションには影響しない。将来 admin GUI からの追加（DB とのマージ）を予定しており、`getDeniedServers()` が差し替えの単一チョークポイント。
  - `HOME_SERVER`: ホームインスタンス（**単一値**）。所属ユーザーのプロフィールURLが素の `username` になる（他は `username@domain`）。未設定なら短縮なし・素の `/u/username` は 404。クライアント側のリンク生成へは root layout から [HomeServerProvider](../src/components/HomeServerProvider.tsx)（React Context）で配る。
  - `FAVOR_SERVERS`: 特典サーバー（カンマ区切り）。所属ユーザーは皆勤賞の未投稿許容日数が 4 日（他は 3 日）。解決は [grace.ts](../src/lib/achievements/grace.ts)。

## カレンダー機能
- 月別カレンダー表示（投稿日にサムネイル）。日付クリックでその日の全画像をモーダル表示。**皆勤賞**: その月毎日投稿で👑（過去月のみ判定）。
- **サムネイル**: 128x128px WebP・quality 80。投稿時（`/api/v1/post`内）に生成。クロップ位置は文字位置に応じた角基準（top/left→左上、bottom→左下、right→右上）。既存画像は `npx tsx scripts/generate-thumbnails.ts`。

## 実績・通知機能
- ユーザーページの「実績」タブ（誰でも閲覧可）＋ヘッダーのベル通知（ログインユーザーのみ）。
- 付与は原則「投稿した瞬間」に確定する条件のみ。web/email/mention が収束する `publishImage.ts` に1箇所フック。
- 例外はリアクション起点の実績（`trigger: "reaction"`）。投稿と無関係に増減するため、**リアクションの書き込み（PUT）と `Image.favoriteCount` を更新した瞬間**だけで評価する（[reactionTriggers.ts](../src/lib/achievements/reactionTriggers.ts)）。
- **追加・変更の手順と不変条件は [`src/lib/achievements/README.md`](../src/lib/achievements/README.md) に集約**（keyは永続でリネーム禁止、しきい値は `>=`、live と backfill の集計を必ず同期 等）。
- 既存ユーザーへの反映: `DATABASE_URL=... npx tsx scripts/backfill-achievements.ts`（冪等）。

## PWA対応
ホーム画面追加対応のPWA。Push通知は**やらない**。
- **インストール**: 静的 [manifest.json](../public/manifest.json)（`display: standalone`）。アイコンは `npx tsx scripts/generate-pwa-icons.ts` で生成（`public/icons/`、any/maskable/apple-touch）。metadata（manifest/appleWebApp/viewport）は [layout.tsx](../src/app/layout.tsx)。
- **投稿完了後のおすすめモーダル**: Web投稿の遷移先（画像詳細 `?posted=1`）で、ブラウザ利用中のユーザーにホーム画面追加を提案する（[InstallSuggestModal](../src/components/pwa/InstallSuggestModal.tsx)）。
  - 出す条件: 投稿者本人＋**2投稿目以降**（初投稿では出さない。サーバー側で「この画像以外の投稿があるか」を `findFirst` で存在確認）／standalone でない／Android は `beforeinstallprompt` 捕捉済み・iOS は Safari のみ（デスクトップ・iOS非Safariは対象外＝既存方針）。
  - **実績を獲得した投稿では出さない**。[AchievementCelebration](../src/app/u/%5Busername%5D/status/%5BimageId%5D/AchievementCelebration.tsx) の `fallback` として描画し、投稿直後の割り込みは常に1つまでという排他を構造で保証する。
  - 頻度制御は [suggest.ts](../src/lib/pwa/suggest.ts)（localStorage `shamezo:pwa-suggest`＝キーは [storageKeys.ts](../src/lib/storageKeys.ts) で一元管理）。断られた回数で 30日 → 90日 → 打ち止め。背景タップ/Esc/「いいえ、結構です」/OSダイアログのキャンセルはすべて「断られた」扱い。承諾時は以後 standalone 判定で自然に対象外になるので猶予は記録しない。閉じずに離脱すると猶予が残らないため、同一セッション中の再表示はモジュール変数で抑止する。
  - 完了トーストと重ならないよう 1.2 秒遅らせて表示。iOS は手順（[IosInstallSteps](../src/components/pwa/IosInstallSteps.tsx)・`/settings/install` と共用）をモーダル内に出し、遷移させない。
- **Share Target（簡単投稿）**: 他アプリ共有メニュー → manifest `share_target`（`POST /share-target`）→ 最小SW [sw.js](../public/sw.js) が画像をCache Storageへ保存し `/create?shared=1` へ303 → [CreateClient.tsx](../src/app/create/CreateClient.tsx) がマウント時に取り出し `handleImageSelect` へ。SWはこの用途のみ（オフラインキャッシュなし。登録は [ServiceWorkerRegister.tsx](../src/components/ServiceWorkerRegister.tsx)）。**iOS Safari の PWA では共有受信不可**（仕様上。インストール・下部メニューは動作）。
- **下部メニューバー（standalone時のみ）**: [BottomNav.tsx](../src/components/layout/BottomNav.tsx)。みんな/同じサーバー/投稿(中央強調)/マイページ/メニュー。未ログイン時はログイン必須項目を非表示。表示情報はDBレスな `getSessionClaims()` から layout で取得。
- **standalone判定はCSSのみ**（JS不使用でハイドレーション不整合を回避）: [globals.css](../src/app/globals.css) の `@custom-variant standalone`。BottomNavは `standalone:md:flex`、[SiteHeader](../src/components/layout/SiteHeader.tsx) は `standalone:md:static`（PC非standaloneのみ sticky）。
- layout で cookie を読むため全ページが動的レンダリング（認証中心アプリのため許容）。
