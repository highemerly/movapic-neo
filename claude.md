# 画像文字入れサービス (movapic-neo)

## 概要
画像に文字を入れて生成するWebアプリ。

## ページ名称
- `/` → **トップページ**
- `/dashboard` → **ダッシュボード**
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

## 主な機能

### 入力
- **テキスト**: 1〜140文字（必須、空白のみは不可）
- **画像**: JPEG/PNG/WebP/HEIC/AVIF、最大25MB
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
- 画像サイズに基づいて自動計算
  - 横書き: 画像幅の1/20程度（約20文字入る）
  - 縦書き: 画像高さの1/15程度（約15文字入る）
- サイズ係数: 小(0.65) / 中(1.0) / 大(1.55) / 特大(2.3)

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
- レート制限: 5秒間に1リクエスト（IPアドレス単位）
- 処理タイムアウト: 30秒（超過時は504エラー）
- レスポンスにContent-Lengthヘッダーを含む

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

### POST /api/v1/email-generate（内部API）
- Cloudflare Email Workerから転送されたraw emailを処理
- `X-API-Key`ヘッダーで認証、`X-Email-Prefix`でユーザー特定
- 件名からオプション解析（例: "上 赤 大"）、本文がテキスト、添付が画像
- 出力形式はユーザーの連携インスタンス（Mastodon/Misskey）で自動決定
- 生成画像はR2にアップロード、メタデータはDBに保存（source: "email"）

### GET/POST/DELETE /api/v1/images/[id]/favorite
- **GET**: お気に入り状態取得（認証不要）
  - レスポンス: `{ favoriteCount, isFavorited, recentFavoriters[] }`
- **POST**: お気に入り登録（認証必須）
  - レスポンス: `{ success, favoriteCount, isFavorited: true }`
- **DELETE**: お気に入り解除（認証必須）
  - レスポンス: `{ success, favoriteCount, isFavorited: false }`

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

## Bot投稿機能（メンション投稿）
Mastodon上でBotアカウントにメンションすることで画像生成・投稿を行う機能。

### 仕組み
- **Botアカウント**: `@movapic@handon.club`（環境変数で設定可能）
- **処理フロー**:
  1. ユーザーがBotに画像付きメンションを送信
  2. Botが通知をポーリングで取得（`src/lib/mention/fetcher.ts`）
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
- **サイズ**: 64x64px（WebP形式、quality 60）
- **生成タイミング**: 投稿時（`/api/v1/post`内）
- **クロップ位置**: 文字位置に応じた角を基準
  - top/left → 左上から
  - bottom → 左下から
  - right → 右上から
- **既存画像のサムネイル生成**: `npx tsx scripts/generate-thumbnails.ts`

## 本番DBマイグレーション

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```
