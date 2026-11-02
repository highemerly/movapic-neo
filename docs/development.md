# 開発フロー

## ブランチと PR
- **main へは直接コミット・push しない**。変更は必ずブランチを切り、PR → CI 緑 → squash マージで取り込む（依存更新を Renovate の PR で回すため、人の変更も同じ経路に揃える）。
- 手元: [.githooks/pre-commit](../.githooks/pre-commit) が main 上のコミットを拒否する。clone ごとに1回有効化する:
  ```bash
  git config core.hooksPath .githooks
  ```
- サーバー側: GitHub の ruleset（定義は [.github/rulesets/main.json](../.github/rulesets/main.json)）が main への push を拒否する。

### ruleset の中身と理由
| ルール | 設定 | 理由 |
|---|---|---|
| PR 必須 | 承認数 0 | 一人運用で、自分の PR は自分で承認できないため |
| マージ方式 | squash のみ＋linear history | 従来の「1変更＝1コミット」の履歴を保つ |
| 必須チェック | `checks / check`（vitest / eslint / tsc）・`golden / test`（ゴールデン画像テスト） | ブランチ push で [ci.yml](../.github/workflows/ci.yml) が付ける。golden は sharp/skia/libvips の依存更新がイメージで壊れないかも兼ねる。本番イメージのビルドはタグ時だけ |
| 最新化の強制 | しない（strict=false） | Renovate の PR が複数並んだとき、1件マージするたびに全件を rebase・再 CI させないため |
| force push・削除 | 禁止 | |
| バイパス | なし（管理者も対象） | |

ruleset を変えたら JSON を直して反映する（作成時は POST、以降は `gh api repos/highemerly/movapic-neo/rulesets` で id を引いて PUT）:
```bash
gh api -X POST repos/highemerly/movapic-neo/rulesets --input .github/rulesets/main.json
gh api -X PUT repos/highemerly/movapic-neo/rulesets/<id> --input .github/rulesets/main.json
```

## 依存更新（Renovate）
依存は Renovate（GitHub App）が出す PR で上げる。設定は [.github/renovate.json5](../.github/renovate.json5)（各ルールの理由はコメント参照）。
- **毎週月曜・木曜の 9時前（JST）** にまとめて PR が来る（lockfile の一括更新は月曜のみ）。自動マージはしない。
- **承認制のもの**は PR が自動では来ず、Issue「Dependency Dashboard」の Pending Approval に並ぶ:
  - メジャー更新全般（コード側の対応が要るため）
  - sharp の 0.35 以降（Alpine の libvips が 8.18.3 以上になるまでソースビルドできない）
- Node のメジャーは Dockerfile・CI・`.tool-versions`・`@types/node` が1つの PR にまとまる。
- 対象外: [docker-compose.yml](../docker-compose.yml)（本番の共有 Postgres に合わせて手で上げる）・[workers/](../workers/)（CI が無く手動デプロイ）。
- `node:22-alpine` は digest 固定。Alpine や Node のパッチ更新は digest 更新の PR として来る（apk の vips/libheif の版が変わり得るので golden を必ず見る）。

### PR が来たら
1. CI（`checks / check`・`golden / test`・`e2e / smoke`）が緑か見る。赤ならマージしない（checks と golden は ruleset でマージできない。e2e はまだ必須でないので目で見る）。
2. PR 本文の変更履歴（Renovate が載せる）を読む。
3. 種類に応じて確認を足す。CI が見ているのは unit・lint・型・ゴールデン（描画）と、E2E スモーク（本番イメージで主要ページが開くか・プレビュー生成が通るか）まで。**ログイン・投稿・Fediverse 連携・ジョブは見ていない**:

   | 種類 | 例 | マージ前の確認 |
   |---|---|---|
   | 型定義・開発ツール | `@types/*`・eslint・typescript・tailwind-merge | CI 緑ならマージ |
   | 描画系 | skia-canvas・`node:22-alpine` の digest | golden 緑ならマージ |
   | 実行時に効くもの | next・react・prisma・jose・ws・pg・mailparser・`@aws-sdk/*` | E2E 緑でページ表示・プレビュー生成までは確認済み。ログイン・投稿は手元で確認 |
   | 0.x のもの | graphile-worker | 0.x はマイナーでも互換を崩すことが多いのに Renovate はメジャー扱いしない。変更履歴を読んでから手元で確認（Bot・メールのジョブ） |
   | タグ時にしか動かない Actions | docker/login-action・docker/metadata-action・peter-evans/create-pull-request・buildkit-cache-dance | PR の CI では実行されない。マージ後、次のリリースの docker-build.yml で初めて動く |
4. squash マージする。
5. 手元で入れ直す（`npm ci` が postinstall で sharp を system libvips にソースビルドし直す。`npm ci` は生成済みの Prisma クライアントごと node_modules を消すので generate も要る）:
   ```bash
   git switch main && git pull
   npm ci
   npx prisma generate
   ```
   `.tool-versions` の node が上がったときは `asdf install` も行う。

### 承認待ち（メジャー）の片付け方
- 着手するときに Dashboard のチェックを入れる → PR が作られる。一度に多く承認せず1つずつ。
- CI が落ちたら、その Renovate のブランチ（`renovate/...`）に直接コミットを足して直す。人のコミットが入ったブランチは Renovate が以後書き換えない。
- sharp 0.35 は、`node:22-alpine` の digest 更新 PR の golden ログで `vips-dev` の版が 8.18.3 以上になっていたら承認する（それまでは承認してもソースビルドが失敗する）。

### その他
- 今は要らない更新: PR を閉じる（その版は作り直されない。次の版が出れば再び PR になる）。恒久的に止めるなら renovate.json5 にルールを足す。
- 急ぐ更新（セキュリティ修正など）: Dashboard の Awaiting Schedule でチェックを入れるとスケジュールを待たずに PR が作られる。
- 衝突した PR は Renovate が自動で rebase する。急ぐときは PR 本文の rebase チェックボックスを入れる。
- 手元で `npm update` はしない（Renovate の PR とぶつかる）。依存の追加（`npm install <新しいパッケージ>`）はブランチを切って PR で。

## リリース
1. バージョンの Bump・リリースノート（[releaseNotes.ts](../src/data/releaseNotes.ts)）もブランチ → PR でマージする。
2. マージ後の main を pull し、タグを push する（タグは ruleset の対象外）:
   ```bash
   git switch main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
3. タグ push で [docker-build.yml](../.github/workflows/docker-build.yml) がイメージをビルド・push し、k8s マニフェストへ PR を出す。
