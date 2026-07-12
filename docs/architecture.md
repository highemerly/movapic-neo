# アーキテクチャ

## コンポーネント構成（3-tier）
本番環境（pic.handon.club）は k8s (VKE) 構成で、FluxによるGitOps管理。
同一のDockerイメージを `COMPONENT_ROLE`（`web` | `worker-front` | `compute`、未設定=ローカルall-in-one）で起動分離する。

- **web**: ページ＋軽量API（producer）。
- **worker-front**: `/api/v1/generate`・`/api/v1/post`・`/api/v1/ingest/email` を配信＋Graphile Worker consumer（bot/emailジョブ）＋定期ジョブのスケジューラ（graphile-worker の crontab で 30分ごとに `periodic` タスクを enqueue。[定期ジョブ](./periodic-jobs.md)参照）。**sharp/skia を呼ばない**。Redis的な役割（レート制限、Workerの管理）を担っており、必ず1Pod。
- **compute**: 画像生成専用のステートレス内部サービス。外部Ingressなし、秘密情報を持たない（`COMPUTE_API_KEY` のみ）。内部API: `POST /api/internal/render`（文字入れ生成＝processImage）/ `POST /api/internal/finalize`（mime判定＋寸法＋サムネ）。worker-front は `src/lib/compute/client.ts` 経由で呼ぶ。

### ルート境界とヘルスチェック
- `src/proxy.ts`（旧 `middleware.ts`・Next.js 16でリネーム）が role でルート境界を強制（compute は `/api/internal/*`＋`/api/health` のみ／非compute は `/api/internal/*` を404）。
- 全pod の k8s probe は `/api/health`。`instrumentation.ts` が role で sharp ロードと consumer 起動をゲート。
- Next standalone は全ルートをboot評価するため、画像処理ルートは sharp/skia を handler内 dynamic import 必須（非画像podで常駐させない）。

## HEIC対応
prebuilt の `@img/sharp-*` は HEVC（HEIC）非対応のため、**system libvips に対し sharp をソースビルド**して使う。仕組み・依存・各踏み抜きはコメント参照:
- ビルド: postinstall [scripts/use-system-libvips.mjs](../scripts/use-system-libvips.mjs)（mac は事前に `brew install vips`）
- ネイティブ依存（build/runtime の apk パッケージ）: [Dockerfile](../Dockerfile) のコメント
- デコード処理（iref 制限の `unlimited`・HEIF→JPEG化）: [rotate.ts](../src/lib/image/rotate.ts)
- ソースビルドsharpは runtime に vips-cpp 必須。欠けると compute 起動不能（`ERR_DLOPEN_FAILED`）。

### やってはいけない
- `.npmrc` の `omit=optional` で prebuilt を消す（lightningcss 等の native optional も巻き込み dev/build が壊れる）。sharp の `@img` だけ postinstall で除去する。
- `heic-convert` の再導入（純JS/WASMで遅く生成が504タイムアウトしたため廃止。commit `aec8325`）。

## 本番DBマイグレーション
```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```
