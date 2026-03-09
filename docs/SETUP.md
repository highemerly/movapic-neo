# movapic-neo セットアップガイド

画像に文字を合成するWebアプリケーション。Mastodon/Misskey OAuth認証、メール投稿機能を備える。

## 目次

1. [必要な環境](#必要な環境)
2. [ローカル開発環境のセットアップ](#ローカル開発環境のセットアップ)
3. [環境変数の設定](#環境変数の設定)
4. [Cloudflare R2のセットアップ](#cloudflare-r2のセットアップ)
5. [Cloudflare Email Workerのセットアップ](#cloudflare-email-workerのセットアップ)
6. [本番環境へのデプロイ](#本番環境へのデプロイ)

---

## 必要な環境

- Node.js 20以上
- Docker / Docker Compose
- Cloudflareアカウント（R2、Email Routing、Workers用）
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

# Cloudflare R2
CF_ACCOUNT_ID="<CloudflareアカウントID>"
R2_ACCESS_KEY_ID="<R2 APIトークンのアクセスキーID>"
R2_SECRET_ACCESS_KEY="<R2 APIトークンのシークレットアクセスキー>"
R2_BUCKET_NAME="movapic-images"
R2_PUBLIC_URL="https://img.pic.handon.club"

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

## Cloudflare R2のセットアップ

### 1. バケットの作成

1. Cloudflareダッシュボード → R2 → バケットを作成
2. バケット名: `movapic-images`（または任意の名前）
3. リージョン: 自動

### 2. カスタムドメインの設定

1. バケット設定 → カスタムドメイン
2. `img.pic.handon.club` などを設定
3. DNSレコードが自動作成される

### 3. APIトークンの作成

1. R2 → 概要 → R2 APIトークンを管理
2. 「APIトークンを作成」
3. 権限: オブジェクトの読み取りと書き込み
4. バケット: 作成したバケットを指定
5. 生成されたアクセスキーIDとシークレットを`.env`に設定

### 4. CORSの設定（必要に応じて）

バケット設定 → CORS → 以下を追加：

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

---

## Cloudflare Email Workerのセットアップ

メール投稿機能を有効にするための設定。

### 1. Wranglerのインストール

```bash
npm install -g wrangler
wrangler login
```

### 2. Workerのデプロイ

```bash
cd workers/email-forwarder
npm install
wrangler deploy
```

### 3. シークレットの設定

```bash
# INTERNAL_API_KEYをシークレットとして設定
wrangler secret put INTERNAL_API_KEY
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
R2_PUBLIC_URL="https://img.pic.handon.club"
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
wrangler tail movapic-email-forwarder

# シークレットの確認
wrangler secret list
```
