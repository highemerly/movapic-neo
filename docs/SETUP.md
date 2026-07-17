# movapic-neo セットアップガイド

画像に文字を合成するWebアプリケーション。Mastodon/Misskey OAuth認証、メール投稿機能を備える。

## 目次

1. [必要な環境](#必要な環境)
2. [ローカル開発環境のセットアップ](#ローカル開発環境のセットアップ)
3. [環境変数の設定](#環境変数の設定)
4. [オブジェクトストレージのセットアップ](#オブジェクトストレージのセットアップ)
5. [Cloudflare Email Workerのセットアップ](#cloudflare-email-workerのセットアップ)
6. [本番環境へのデプロイ](#本番環境へのデプロイ)

---

## 必要な環境

- Node.js 20以上
- Docker / Docker Compose
- S3互換オブジェクトストレージ（AWS S3 / MinIO など）
- Cloudflareアカウント（Email Routing・Workers用。メール投稿機能を使う場合）
- PostgreSQL 16以上

---

## ローカル開発環境のセットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd movapic-neo
npm install
```

### 2. PostgreSQLの起動

```bash
# DBコンテナのみ起動
docker compose up -d db

# movapicデータベースを作成
docker exec -it movapic-db psql -U postgres -c "CREATE DATABASE movapic;"
```

### 3. 環境変数の設定

`.env`ファイルを作成（後述の「環境変数の設定」を参照）

### 4. データベースマイグレーション

```bash
npx prisma migrate dev --name init
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 でアクセス可能。

---

## 環境変数の設定

`.env`ファイルを作成し、以下の環境変数を設定：

```bash
# Database
DATABASE_URL="postgresql://postgres:K9cz8szGv14d@localhost:15433/movapic?schema=public"

# Security（openssl rand -hex 32 で生成）
JWT_SECRET="<32バイトのランダムな16進数文字列>"
TOKEN_ENCRYPTION_KEY="<32バイトのランダムな16進数文字列>"
INTERNAL_API_KEY="<32バイトのランダムな16進数文字列>"

# オブジェクトストレージ（S3互換。AWS S3 / MinIO など）
S3_ENDPOINT="https://s3.ap-northeast-1.amazonaws.com"  # 例: MinIO は http://localhost:9000
S3_REGION="ap-northeast-1"                             # 省略時は "auto"（AWS S3 は実リージョン必須。MinIO は "auto" で可）
S3_ACCESS_KEY_ID="<アクセスキーID>"
S3_SECRET_ACCESS_KEY="<シークレットアクセスキー>"
S3_BUCKET_NAME="movapic-images"
S3_PUBLIC_URL="https://img.pic.handon.club"            # 画像を配信する公開ベースURL（バケットのパブリック配信 or CDN/カスタムドメイン）

# App
NEXT_PUBLIC_APP_URL="https://pic.handon.club"

# 許可サーバー（カンマ区切り、空の場合は全て許可）
ALLOWED_SERVERS="handon.club"
```

### セキュリティキーの生成

```bash
# JWT_SECRET、TOKEN_ENCRYPTION_KEY、INTERNAL_API_KEYの生成
openssl rand -hex 32
```

---

## オブジェクトストレージのセットアップ

ストレージ層は **S3 互換 API（`@aws-sdk/client-s3`）** で実装しており、AWS S3・MinIO など任意のS3互換ストレージで動く（[storage.ts](../src/lib/storage/storage.ts)）。上記 `S3_*` 環境変数を使う。

必要なもの:
1. **バケット**を1つ作成（例: `movapic-images`）→ `S3_BUCKET_NAME`。
2. **アクセスキー**（読み書き権限。可能ならバケット限定）→ `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`。
3. **エンドポイント / リージョン** → `S3_ENDPOINT` / `S3_REGION`（AWS S3 は実リージョン必須。MinIO は `S3_REGION=auto` で可）。
4. **公開配信URL** → `S3_PUBLIC_URL`。生成画像は公開URLで直接配信するため、バケットのパブリック公開設定か、前段のCDN/カスタムドメインが必要。

CORS（ブラウザから直接読む場合に必要に応じて設定）:

```json
[
  {
    "AllowedOrigins": ["https://pic.handon.club"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

### プロバイダ別メモ

- **MinIO（ローカル開発向け）**: `S3_ENDPOINT=http://localhost:9000` / `S3_REGION=auto`。バケットをpublic-readにするか、開発用に公開ポリシーを付与して `S3_PUBLIC_URL` を配信URLに合わせる。
- **AWS S3**: `S3_ENDPOINT=https://s3.<region>.amazonaws.com` / `S3_REGION=<実リージョン>`。公開配信はバケットポリシー or CloudFront。

---

## Cloudflare Email Workerのセットアップ

メール投稿機能を有効にするための設定。

### 1. Cloudflareへのログイン

```bash
npx wrangler login
```

### 2. Workerのデプロイ

```bash
cd workers/email-forwarder
npm install
npx wrangler deploy
```

### 3. シークレットの設定

```bash
# INTERNAL_API_KEYをシークレットとして設定
npx wrangler secret put INTERNAL_API_KEY
# プロンプトが表示されたら、.envのINTERNAL_API_KEYの値を入力
```

### 4. Email Routingの設定

1. Cloudflareダッシュボード → Websites → ドメインを選択 → Email → Email Routing
2. 「Email Routing」を有効化
3. 「Routing rules」→「Create address」
4. 「Catch-all address」を作成:
   - Action: Send to a Worker
   - Destination: `movapic-email-forwarder`

### 5. DNSレコードの確認

Email Routing有効化時に自動でMXレコード等が設定される。

---

## 本番環境へのデプロイ

### Dockerを使用したデプロイ

```bash
# イメージのビルドとコンテナ起動
docker compose up -d

# ログの確認
docker compose logs -f app
```

### 環境変数（本番用）

本番環境では以下を変更：

```bash
NEXT_PUBLIC_APP_URL="https://pic.handon.club"
S3_PUBLIC_URL="https://img.pic.handon.club"
```

### Nginxリバースプロキシの設定例

```nginx
server {
    listen 443 ssl http2;
    server_name pic.handon.club;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3012;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 動作確認

### OAuth認証のテスト

```bash
curl -X POST http://localhost:3000/api/auth/fediverse/register \
  -H "Content-Type: application/json" \
  -d '{"server": "handon.club"}'
```

成功すると認証URLが返される。

### 画像生成のテスト

```bash
curl -X POST http://localhost:3000/api/v1/generate \
  -F "image=@test.jpg" \
  -F "text=テスト" \
  -F "position=top" \
  -F "font=hui-font" \
  -F "color=white" \
  -F "size=medium" \
  -F "output=mastodon" \
  --output result.avif
```

---

## トラブルシューティング

### DBに接続できない

```bash
# コンテナの状態確認
docker ps

# PostgreSQLのログ確認
docker logs movapic-db
```

### マイグレーションエラー

```bash
# スキーマをリセット（開発時のみ）
npx prisma migrate reset

# クライアント再生成
npx prisma generate
```

### Email Workerが動作しない

```bash
# Workerのログ確認
npx wrangler tail movapic-email-forwarder

# シークレットの確認
npx wrangler secret list
```
