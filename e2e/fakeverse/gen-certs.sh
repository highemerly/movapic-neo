#!/bin/sh
# 偽 Fediverse サーバー（server.mjs）用の TLS 証明書を作る。E2E の起動前に1回実行する。
# CA を作ってサーバー証明書（mastodon.test / misskey.test）に署名し、アプリは ca.pem を
# NODE_EXTRA_CA_CERTS で信頼する。秘密鍵をリポジトリに置かないよう、毎回ここで作る（certs/ は .gitignore）。
# mac の LibreSSL と Ubuntu の OpenSSL の両方で通る書き方にしている（-addext を使わない）。
set -eu
dir="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$dir"
cd "$dir"

openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=fakeverse-ca" \
  -keyout ca-key.pem -out ca.pem 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=mastodon.test" \
  -keyout server-key.pem -out server.csr 2>/dev/null
printf 'subjectAltName=DNS:mastodon.test,DNS:misskey.test\n' > san.ext
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -days 30 \
  -extfile san.ext -out server.pem 2>/dev/null
rm -f server.csr san.ext ca.srl
# コンテナ内の別ユーザー（アプリは nextjs、偽サーバーは root）から読めるようにする。
chmod 644 ./*.pem
echo "[gen-certs] wrote $dir"
