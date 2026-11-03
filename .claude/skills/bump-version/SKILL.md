---
name: bump-version
description: リリース手順の 1（バージョンの bump をブランチで作り PR を出す）までを行う。ユーザーが「1.5.2 を出したい」「バージョンを上げて」「リリースの PR を作って」と言ったとき、または /bump-version [X.Y.Z] で呼ばれたときに使う。タグの push はしない。
argument-hint: "[X.Y.Z（省略時はパッチを1つ上げる）]"
---

# バージョンの bump PR を作る

[docs/development.md](../../../docs/development.md) の「リリース」手順 1 を行う。このスキルの呼び出し自体が、ブランチ作成・コミット・push・PR 作成の許可である（CLAUDE.md の「勝手にコミットしない」の例外）。**タグの作成・push、PR のマージはしない**（手順 2 以降はユーザーが行う）。

## 手順

1. **前提の確認**（どれかに当てはまったら止めてユーザーに伝える）
   - `git status --porcelain` が空であること（未コミットの変更を bump のコミットに混ぜない）。
   - `git switch main && git pull` で最新の main にする。
2. **バージョンを決める**
   - 引数があればそれを使う。なければ package.json の version のパッチを 1 つ上げる（1.5.1 → 1.5.2）。
   - 前回のタグ（`git describe --tags --abbrev=0`）より新しいこと、`vX.Y.Z` のタグと `release/vX.Y.Z` ブランチがまだ無いことを確かめる。
3. **前回のタグからの差分を確かめる**
   - `git log --oneline <前回のタグ>..HEAD` が空ならリリースする中身が無いので止める。
   - `git diff --stat <前回のタグ>..HEAD -- prisma/` に変更があれば、本番の DB マイグレーションが要ることを最後の報告で必ず伝える（マイグレーションはユーザーが実行する。[docs/architecture.md](../../../docs/architecture.md) 参照）。
4. **ブランチを切って bump する**
   ```bash
   git switch -c release/vX.Y.Z
   npm version X.Y.Z --no-git-tag-version
   ```
   - npm version は package.json と package-lock.json の version を両方そろえる（手で package.json だけ直すと lockfile とずれる）。
   - `git diff --stat` が package.json と package-lock.json だけであることを確かめる。
5. **リリースノート**（[src/data/releaseNotes.ts](../../../src/data/releaseNotes.ts)）
   - リリースノートはマイナー単位（"1.5"）で書く。**パッチの bump では追記しない**（v1.5.1 の前例どおり）。
   - マイナー・メジャーを上げるときは、差分のコミットから add / fix / change の下書きを作ってユーザーに見せ、確認を取ってから先頭に追記する（文体は既存の項目に合わせる。日付は JST の今日）。
6. **コミット・push・PR**
   - コミットメッセージは `Bump vX.Y.Z`（attribution の行を付ける）。
   - `git push -u origin release/vX.Y.Z`
   - `gh pr create` でタイトル `Bump vX.Y.Z`。本文は**英語**で `## Summary` から始め、前回のタグからの変更（PR 番号付き。Renovate の依存更新はまとめて1行でよい）と、マイグレーションの要否を書く（GitHub に出す PR・Release は英語に揃える）。
7. **報告**: PR の URL と、次にユーザーがやること（CI の `ci-result` が通ったら squash マージ（`release/*` はテストを省くので数十秒で緑になる。検査はタグ push 時に docker-build.yml が全部回す） → `git switch main && git pull` → `git tag vX.Y.Z && git push origin vX.Y.Z`）を伝える。前回のタグからの差分に、タグ時にしか動かない Actions（docs/development.md の表）の更新が入っていれば、タグ push 後に docker-build.yml のログを見るよう添える。
