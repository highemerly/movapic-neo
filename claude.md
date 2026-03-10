# 画像文字入れサービス (movapic-neo)

## 概要
画像に文字を入れて生成するWebアプリ。

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
  - サイズ: 中(default) / 大 / 小
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
- サイズ係数: 小(0.7) / 中(1.0) / 大(1.4)

### 文字の影
- 視認性向上のため、全ての文字に影を追加
- 薄い色（白、緑、黄、桃、橙）→ 黒い影
- 濃い色（赤、青、茶）→ 白い影

### 画像の取り扱い
- 生成画像はBlobURLで一時的に表示し、ページ離脱時に破棄
- 生成後にオプションを変更すると「画像を再生成」ボタンが有効化される
- 「最初からやり直す」ボタンで画像・テキスト・オプション全てをリセット

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
  - size: "small" | "medium" | "large"
  - output: "mastodon" | "misskey" | "none"
- **レスポンス**: image/jpeg または image/avif（バイナリ）
- **レスポンスヘッダー**: Content-Type, Content-Length, Content-Disposition, Cache-Control
- **エラーレスポンス**: 400(バリデーション) / 429(レート制限) / 504(タイムアウト) / 500(その他)

### POST /api/v1/email-generate（内部API）
- Cloudflare Email Workerから転送されたraw emailを処理
- `X-API-Key`ヘッダーで認証、`X-Email-Prefix`でユーザー特定
- 件名からオプション解析（例: "上 赤 大"）、本文がテキスト、添付が画像
- 出力形式はユーザーの連携インスタンス（Mastodon/Misskey）で自動決定
- 生成画像はR2にアップロード、メタデータはDBに保存（source: "email"）

## メール投稿機能
- **Cloudflare Email Worker** (`workers/email-forwarder/`): メールを受信しraw dataをAPIへ転送
- **メールパーサー** (`src/lib/email/parser.ts`): 件名→オプション、本文→テキスト、添付→画像
- **オプション指定**: 件名にスペース区切りで日本語キーワード
  - 位置: 上/下/左/右
  - 色: 白/赤/青/緑/黄/茶/桃/橙
  - サイズ: 小/中/大
  - フォント: ふい字/ゴシック/ラノベ

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
