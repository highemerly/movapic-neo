# 画像文字入れサービス (movapic-neo)

## 概要
画像に文字を入れて生成するWebアプリ。非ログイン機能を先行実装し、後にMastodon/MisskeyのOAuth連携を追加予定。

## 技術スタック
- **フレームワーク**: Next.js 16 (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **画像処理**: sharp + skia-canvas + heic-convert（サーバーサイド）
- **コンテナ**: Docker（ポート: 3012）
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
- 文字入れ済み画像（JPEG or AVIF形式）
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
- サーバーに画像を保存しない（将来のログインユーザー向け機能では保存予定）
- 生成画像はBlobURLで一時的に表示し、ページ離脱時に破棄
- 生成後にオプションを変更すると「画像を再生成」ボタンが有効化される
- 「最初からやり直す」ボタンで画像・テキスト・オプション全てをリセット

### APIの制限
- レート制限: 5秒間に1リクエスト（IPアドレス単位）
- 処理タイムアウト: 30秒（超過時は504エラー）
- レスポンスにContent-Lengthヘッダーを含む

## ディレクトリ構成（重要なファイル）

```
src/
├── app/
│   ├── page.tsx              # メインページ（フォーム・結果表示）
│   └── api/v1/generate/
│       └── route.ts          # 画像生成API
├── components/
│   ├── TextInput.tsx         # テキスト入力（140文字制限）
│   ├── ImageUpload.tsx       # 画像アップロード（D&D対応）
│   └── CommandSelect.tsx     # コマンド選択（5つのプルダウン）
├── lib/
│   ├── imageProcessor.ts     # 画像処理メイン（sharp + skia-canvas使用）
│   ├── rateLimit.ts          # レート制限（IPアドレス単位）
│   └── utils.ts              # ユーティリティ関数
├── types/
│   └── index.ts              # 型定義・定数・デフォルト値
fonts/
├── HuiFont29.ttf             # ふい字フォント（デフォルト）
├── NotoSansJP-Regular.ttf    # Noto Sans JP
└── LightNovelPOPv2.otf       # ラノベPOP
```

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
- **エラーレスポンス**:
  - 400: バリデーションエラー
  - 429: レート制限超過
  - 504: タイムアウト
  - 500: その他のエラー

## 開発・運用

### 起動
```bash
# 開発
npm run dev

# Docker
docker-compose up
```

### ポート
- 開発: 3000
- Docker: 3012

## 将来の拡張予定
- Mastodon OAuth / Misskey MiOAuth連携
- ログインユーザー向け機能（画像保存など）
- フォントの追加
