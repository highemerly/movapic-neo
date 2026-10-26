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
| 必須チェック | `checks / check`（vitest / eslint / tsc） | ブランチ push で [ci.yml](../.github/workflows/ci.yml) が付ける |
| 最新化の強制 | しない（strict=false） | Renovate の PR が複数並んだとき、1件マージするたびに全件を rebase・再 CI させないため |
| force push・削除 | 禁止 | |
| バイパス | なし（管理者も対象） | |

ruleset を変えたら JSON を直して反映する（作成時は POST、以降は `gh api repos/highemerly/movapic-neo/rulesets` で id を引いて PUT）:
```bash
gh api -X POST repos/highemerly/movapic-neo/rulesets --input .github/rulesets/main.json
gh api -X PUT repos/highemerly/movapic-neo/rulesets/<id> --input .github/rulesets/main.json
```

## リリース
1. バージョンの Bump・リリースノート（[releaseNotes.ts](../src/data/releaseNotes.ts)）もブランチ → PR でマージする。
2. マージ後の main を pull し、タグを push する（タグは ruleset の対象外）:
   ```bash
   git switch main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
3. タグ push で [docker-build.yml](../.github/workflows/docker-build.yml) がイメージをビルド・push し、k8s マニフェストへ PR を出す。
