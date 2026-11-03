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
| 必須チェック | `ci-result`（checks / golden / e2e のうち走ったものの結果をまとめたもの） | ブランチ push で [ci.yml](../.github/workflows/ci.yml) が付ける。ジョブは差分で間引く（下の「CI」）ので、個別に必須にするとスキップされたジョブに結果が付かずマージできなくなる |
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
1. CI（`ci-result`）が緑か見る。赤なら ruleset でマージできない。依存の更新は checks・golden・e2e が全部走る。
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

## CI
[ci.yml](../.github/workflows/ci.yml) が main 以外のブランチへの push で、**差分が影響しうるジョブだけ**を回す。判定は [ci-targets.sh](../.github/scripts/ci-targets.sh)（main との merge-base からの差分ファイルで決める）。

| 変更 | checks（vitest / eslint / tsc） | golden | e2e |
|---|---|---|---|
| `src/**`・依存（package.json・lockfile）・Dockerfile・next.config・prisma など、下に無いもの全部 | ✓ | ✓ | ✓ |
| `e2e/**` | ✓ | – | ✓ |
| `workers/**`（本番イメージに入らないが tsc・eslint の対象） | ✓ | – | – |
| ワークフロー（checks.yml / golden.yml / e2e.yml） | そのワークフローのジョブだけ | 同左 | 同左 |
| ドキュメント（`*.md`・`docs/**`）・`.claude/**`・`.githooks/**`・ruleset・Renovate 設定・docker-build.yml | – | – | – |
| `release/*` ブランチ（バージョンの bump だけ） | – | – | – |

- **一覧に無い種類のファイルは3つとも回す**（知らない変更を素通しさせない）。`src/**` は golden・e2e も必ず回す: 描画は src のどこから壊れるか分からず、E2E が壊れたまま進むと以後の依存更新を確かめられなくなるため。
- 必須チェックは結果をまとめる `ci-result` だけ。成功・スキップは通し、失敗・キャンセルは落とす。
- **main への push では回さない**。マージ前に同じ中身をブランチで通しており、リリースのタグで全部回すため（以前は main でも回していたが、マージが続くと concurrency で途中の実行が捨てられ、ほぼ二重実行だった）。
- **リリース（タグ push）では [docker-build.yml](../.github/workflows/docker-build.yml) が checks・golden・e2e を全部回す**。e2e は push したばかりの本番イメージ（＝デプロイするもの）で回す。全部緑で初めて k8s マニフェストへ PR が出る。ブランチで省いた検査で壊れていたら、ここで止まる（直す PR を出してタグを打ち直す）。

## リリース
1. バージョンの Bump・リリースノート（[releaseNotes.ts](../src/data/releaseNotes.ts)）もブランチ → PR でマージする。Claude Code に `/bump-version [X.Y.Z]`（または「1.5.2 を出したい」）と頼めば PR 作成まで行う（[SKILL.md](../.claude/skills/bump-version/SKILL.md)）。
2. マージ後の main を pull し、タグを push する（タグは ruleset の対象外）:
   ```bash
   git switch main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
3. タグ push で [docker-build.yml](../.github/workflows/docker-build.yml) がイメージをビルド・push し、checks・golden・e2e（そのイメージで）が全部通ったら k8s マニフェストへ PR を出す。
