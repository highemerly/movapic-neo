# 開発フロー

## ブランチと PR
- **main へは直接コミット・push しない**。変更は必ずブランチを切り、PR → CI 緑 → squash マージで取り込む（依存更新を Renovate の PR で回すため、人の変更も同じ経路に揃える）。
- PR は自分に assign する（`gh pr create --assignee @me`）。Renovate の PR とマニフェストのリポジトリへのデプロイ PR も自動で assign される。どのリポジトリの PR も github.com/pulls の「Assigned to you」にまとまるので、見落とさない。
- 手元: [.githooks/pre-commit](../.githooks/pre-commit) が main 上のコミットを拒否する。clone ごとに1回有効化する。
  あわせてコミットの作者のメールを GitHub の noreply にする（公開リポジトリなので、ブランチのコミットの作者は PR の画面で誰でも見られる。
  squash のコミットは GitHub の設定のメールになるが、ブランチのコミットは手元の設定のまま残る）:
  ```bash
  git config core.hooksPath .githooks
  git config user.email 3039555+highemerly@users.noreply.github.com
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
| ドキュメント（`*.md`・`docs/**`）・`.claude/**`・`.githooks/**`・ruleset・Renovate 設定・リリースノートの分類（`.github/release.yml`）・docker-build.yml・tag-release.yml | – | – | – |
| `scripts/release-notes.ts`（タグのビルドでだけ動く） | ✓ | – | – |
| `release/*` ブランチ（リリースの準備だけ） | – | – | – |

- **一覧に無い種類のファイルは3つとも回す**（知らない変更を素通しさせない）。`src/**` は golden・e2e も必ず回す: 描画は src のどこから壊れるか分からず、E2E が壊れたまま進むと以後の依存更新を確かめられなくなるため。
- 全ジョブに `timeout-minutes` を付けている（ふだんの所要時間の数倍。checks 10分・golden 15分・e2e 20分・ビルド 20分・数秒のジョブは5分）。既定の 360 分だと、固まったときに6時間待つことになるため。外から取ってくる Playwright のインストールにも短め（5分）に付けている。
- 必須チェックは結果をまとめる `ci-result` だけ。成功・スキップは通し、失敗・キャンセルは落とす。
- **main への push では回さない**。マージ前に同じ中身をブランチで通しており、リリースのタグで全部回すため（以前は main でも回していたが、マージが続くと concurrency で途中の実行が捨てられ、ほぼ二重実行だった）。
- **リリース（タグ push・Tag a release）では [docker-build.yml](../.github/workflows/docker-build.yml) が checks・golden・e2e を全部回す**。e2e は push したばかりの本番イメージ（＝デプロイするもの）で回す。全部緑で初めてデプロイ PR が出る。ブランチで省いた検査で壊れていたら、ここで止まる（直す PR を出して次の版を出す）。

## リリース
1. 版はタグだけに持ち、アプリ内のリリースノートもタグのビルドが PR 本文から作るので、**リリースに PR は要らない**（パッチ・マイナー・メジャーとも）。Claude Code に `/release [X.Y.Z]`（または「1.5.2 を出したい」）と頼めば、差分から版を提案し、この版で画面に出るリリースノートの行を組み立てて見せ、リリースのコマンドも案内する（ユーザー共通の release スキル）。
2. Actions の画面の **Tag a release**（[tag-release.yml](../.github/workflows/tag-release.yml)）で、上げ方（patch・minor・major）を選んで実行する。main の先頭に次の版のタグを打ち、docker-build.yml を呼ぶ。コマンドなら:
   ```bash
   gh workflow run tag-release.yml --ref main -f bump=patch
   ```
   飛び番の版を出すときは、手元でタグを push する（タグは ruleset の対象外。push でも同じことが起きる）:
   ```bash
   git switch main && git pull && git tag vX.Y.Z && git push origin vX.Y.Z
   ```
3. [docker-build.yml](../.github/workflows/docker-build.yml) がアプリ内のリリースノートを作ってイメージをビルド・push し、checks・golden・e2e（そのイメージで）が全部通ったら GitHub Release を作り、マニフェストのリポジトリ（非公開）へイメージの版を上げる PR（デプロイ PR。web・worker-front・compute の3つ）を出す。
4. デプロイ PR を確かめてマージする。マニフェストのリポジトリは Flux 同期なので、**マージがそのまま本番へのデプロイ**（約1分で反映）。
   - `requires-migration` ラベルが付いていたら、**マージ前に**本番 DB へマイグレーションを当てる（手順は PR 本文と [architecture.md](architecture.md#本番dbマイグレーション)）。
   - マニフェストのリポジトリは必須チェックを設定できない（Free プランの非公開リポジトリ）ので、そちらの CI（yamllint・kubeconform）が緑かは目で見る。

### 版の上げ方
| 上げ方 | いつ |
|---|---|
| patch | 修正と依存の更新だけ |
| minor | 新しい機能（利用者・運用者から見てできることが増えた） |
| major | 互換性を崩す |

- Tag a release は前回のタグ（`vX.Y.Z` の形のもの）から計算する。main 以外から実行したとき・前回のタグからコミットが無いときは止まる。2つ同時には走らない（同じ版を打たないよう concurrency で1つずつ）。
- **GITHUB_TOKEN で push したタグでは、ほかのワークフロー（docker-build.yml の `on: push`）は起動しない**。だから tag-release.yml が docker-build.yml を `workflow_call` で直接呼ぶ（PAT も要らず、二重にも走らない）。呼ぶときの `permissions` は呼ばれる側の権限の和（`contents: write`＝Release・`packages: write`＝イメージ・`pull-requests: read`＝アプリ内のリリースノート）。
- タグは注釈付き（`git tag -a`）で打つ。打った時刻がアプリ内のリリースノートの日時になる。

### リリースの準備で行うこと
- **版はタグだけに持つ**（package.json に `version` を持たない＝版上げの PR が要らない）。docker-build.yml がタグの版をビルド引数 `APP_VERSION` で渡し、[next.config.ts](../next.config.ts) がバンドルへ埋め込む。読むのは [version.ts](../src/lib/version.ts) の `APP_VERSION` だけ（/docs の表記・User-Agent・`/api/health`・/admin）。タグ以外のビルド（ブランチの e2e・golden、手元の dev）は `dev.YYYYMMDDHHMMSS`（ビルドした JST の時刻）になる。
- アプリ内のリリースノートは下の「アプリ内のリリースノート」。リリースのときに書くものは無い（書くのは各 PR）。
- マイグレーションは `prisma/migrations/`。前回のタグから差分があれば、本番のマイグレーションが要る（[architecture.md](architecture.md#本番dbマイグレーション)。当てるのはデプロイ PR のマージ前）。

### デプロイ PR
- 書式はマニフェストのリポジトリに PR を出す全アプリで共通（英語）: タイトル `Update movapic-neo to X.Y.Z`、ラベル `app-update`（アプリの版上げを Renovate などの PR と見分ける）と、マイグレーションがあるときの `requires-migration`。本文はイメージとビルドのリンク・GitHub Release と同じノート（下）、マイグレーションがあるときはその手順（namespace などクラスタ内の名前は `<...>` の引数にしてあり、値はマニフェストのリポジトリの手順書にある）。
- ワークフローが使うシークレット。マニフェストのリポジトリ名とパスもシークレットに置く（このリポジトリは公開で、ワークフローのファイルも Actions のログも誰でも読める。シークレットの値はログで `***` に伏せられる）:

  | シークレット | 中身 |
  |---|---|
  | `K8SG1_REPO` | マニフェストのリポジトリ（`owner/name`） |
  | `K8SG1_MANIFEST_PATHS` | 書き換える prd のマニフェストのパス（web・worker-front・compute の3つ、スペース区切り） |
  | `K8SG1_PAT` | マニフェストのリポジトリへ PR を出すトークン（Contents と Pull requests の Read and write）。`GITHUB_TOKEN` では他のリポジトリへ push できず、PAT で作った PR だからマニフェストのリポジトリの CI も走る |
- **PR が出なかったとき**は docker-build.yml の `create-k8s-pr` のログを見る。マニフェストの `image:` 行が書き換わらなかった（マニフェストの側で書式が変わった）ときはジョブが赤くなる。黙って PR が出ないこと（書き換わらず差分が無いと create-pull-request は何もせず成功する）を防ぐため。
- イメージは検査の結果を待たずに push され、`latest` タグも動く。本番のマニフェストは版を固定しており、**`latest` はデプロイに使わない**。

### GitHub Release
- **タグごと（パッチも含む）に自動で作る**。全検査が通ったときだけ作るので、Release がある版＝デプロイしてよい版。
- ノートは GitHub の自動生成（英語）: 前回のタグからマージされた PR の一覧と差分（Full Changelog）のリンク。見出しは [.github/release.yml](../.github/release.yml) で `Changes` と `Dependencies`（Renovate の PR＝`dependencies` ラベル）に分ける。main は squash マージだけなので、PR の一覧＝コミットの一覧。
- 起点（前回のタグ）は明示している。省くと GitHub は前回の Release を起点にするが、v1.5.3 以前は Release をマイナーごとにしか作っていない（手書き。そのまま残す）。
- 利用者向けのリリースノート（下の「アプリ内のリリースノート」・日本語）とは別物。英語は PR の題名から、日本語は PR 本文から、同じ PR の集まりで作る。

### アプリ内のリリースノート
`/docs/release-note` は利用者向け・日本語で、**パッチも含め版ごと**に出す。GitHub Release（開発者向け・英語・CI や依存の PR も並ぶ）とは読み手が違うので文面は使い回さず、**同じ PR の集まりから、本文の `release-note` ブロックを取る**:

````md
```release-note
add: 〜できる機能を追加しました。
fix: 〜できない問題を修正しました。
change: 〜するように変更しました。
```
````

- **PR を作るときに書く**（利用者から見て変わることがあれば。文体は既存の項目に合わせる）。種別は `add`・`fix`・`change`。PR の題名と本文の残りは英語のまま。見本は [PR テンプレート](../.github/pull_request_template.md) の HTML コメントの中（コメントの中のブロックは拾わない）。
- **ブロックの無い PR は「その他の軽微な修正を行いました。」の1行にまとめる**（書き忘れの受け皿でもある）。ただし変更したファイルが、動いているサービスを変えないもの（`*.md`・`docs/`・`.github/`・`.claude/`・`.githooks/`・`e2e/`・`workers/`・テスト・`__golden__`・`__fixtures__`・`.gitignore`・`vitest.config.ts`）だけの PR は数えない。題名の接頭辞（`ci:` など）は付けていないので、ファイルで決める。依存の更新（Renovate）は「その他の軽微な修正」に入る。
- **空のブロック**は「何も載せない」の明示（サービスに触れるが利用者には見えない PR など）。
- 同じ文は版の中で1行にまとめる。並びは Add・Fix・Change の順で、「その他の軽微な修正」は Fix の最後。載せるものが1つも無い版は出さない。
- 各版に**リリースの日時**（JST・時刻まで）と、GitHub Release への「すべての変更を見る」リンク（Release がある版だけ）を出す。時刻は Tag a release が打つ**注釈付きのタグ**の時刻（手で打った軽量タグならコミットの時刻）。
- **イメージに焼き込み、実行時に GitHub から読まない**。Release がある版＝デプロイしてよい版で、デプロイ済みとは限らないため（読むとまだ出ていない変更が載る）。docker-build.yml の build ジョブが `docker build` の前に [scripts/release-notes.ts](../scripts/release-notes.ts) を素の node で動かし（`npm ci` は要らない）、[releaseNotes-generated.json](../src/data/releaseNotes-generated.json) を上書きする。リポジトリのその JSON は空の配列（ブランチや手元では手で書いた分だけが出る。テストで固定）。
- **毎回全部の版を作り直す**。文言を直すときは PR 本文を直せば、次のリリースで直る。
- 組み立ての規則は [src/lib/releaseNotes/rules.ts](../src/lib/releaseNotes/rules.ts)（画面とスクリプトが共有。スクリプトが読むので値の import をしない）。版ごとに何が載ったかと「その他の軽微な修正」に数えた PR は、build ジョブの Summary「Release notes (in-app)」に出る（書き忘れはここで気づく）。
- **v1.5.5 までは手で書いたもの**（[src/data/releaseNotes.ts](../src/data/releaseNotes.ts)）。1.4 まではマイナーごとのまとめ、v1.4.1〜v1.5.5 は同じ規則で版ごとに書いてある（v1.4.1〜v1.5.1 は PR の無い時期で、以前「1.5」にまとめていた文をコミットから振り分けた）。スクリプトはその最新の版より新しいタグだけを作る。
- 手元で試す（実際のタグと PR から作る）:
  ```bash
  GH_TOKEN=$(gh auth token) GITHUB_REPOSITORY=highemerly/movapic-neo node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/release-notes.ts <版> /tmp/notes.json
  ```

### 作り直し
失敗した実行は Actions の画面で **Re-run**（失敗したジョブだけ・全部）する。以前の docker-build.yml の手動実行（workflow_dispatch）はやめた: 任意のブランチ・任意の版の文字列で、デプロイ PR まで出せてしまうため。
