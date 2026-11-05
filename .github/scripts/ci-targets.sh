#!/usr/bin/env bash
# ブランチ push の CI（ci.yml）で、どのジョブ（checks / golden / e2e）を回すかを決める。
# main との差分ファイルを見て、変更が影響しうるジョブだけ true にする。
#
# 方針（docs/development.md「CI」）:
# - アプリ・依存・ビルド設定に触れたら3つとも回す。src/** は golden・e2e も回す
#   （描画は src のどこから壊れるか分からず、E2E が壊れたまま進むと以後の依存更新を確かめられなくなるため）。
# - 下の一覧にないファイルは3つとも回す（知らない種類の変更を素通しさせない）。
# - release/*（リリースの準備＝アプリ内のリリースノートだけ）は何も回さない。タグ push 時に docker-build.yml が全部回す。
#
# 使い方: ci-targets.sh <ブランチ名>。GITHUB_OUTPUT があればそこへ、無ければ標準出力へ書く（手元で試せる）。
set -euo pipefail

branch="${1:?branch name required}"
checks=false
golden=false
e2e=false

if [[ "$branch" != release/* ]]; then
  base="$(git merge-base origin/main HEAD)"
  while IFS= read -r file; do
    case "$file" in
      # 動作に影響しないもの（ドキュメント・Claude Code のスキル・ローカル hook・GitHub の設定）
      *.md | docs/* | .claude/* | .githooks/* | .github/rulesets/* | .github/renovate.json5 | .github/release.yml | LICENSE) ;;
      # タグ push でしか動かない（ブランチでは確かめようがない）
      .github/workflows/docker-build.yml) ;;
      # ワークフロー単体の変更（Actions の更新など）は、それを使うジョブだけ
      .github/workflows/checks.yml) checks=true ;;
      .github/workflows/golden.yml) golden=true ;;
      .github/workflows/e2e.yml) e2e=true ;;
      # E2E のテストコード（tsc・eslint の対象でもある）
      e2e/*) checks=true; e2e=true ;;
      # Cloudflare Email Worker は本番イメージに入らない（tsc・eslint の対象ではある）
      workers/*) checks=true ;;
      *) checks=true; golden=true; e2e=true ;;
    esac
  done < <(git diff --name-only "$base" HEAD)
fi

out="${GITHUB_OUTPUT:-/dev/stdout}"
{
  echo "checks=$checks"
  echo "golden=$golden"
  echo "e2e=$e2e"
} >> "$out"
