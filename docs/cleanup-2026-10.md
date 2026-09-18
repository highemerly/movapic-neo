# クリーンアップ: 自動穴埋め（2026-09 以前のルール）の撤去

2026年10月分から皆勤賞の穴埋めは「穴埋めポイント制・全ユーザー手動」に切り替わった（[achievements/README](../src/lib/achievements/README.md) の「穴埋めポイント制」）。
切り替えの時点では、2026年9月分を従来どおり動かすために旧ルール（固定上限 3/4 日・自動穴埋め・`User.autoMakeup`）のコードを残してある。このファイルはその撤去作業のチェックリスト。

## 着手してよい条件

**2026-10-11 00:00 JST 以降**（2026年9月分の穴埋め締切＝10月10日 23:59 JST を過ぎてから）。

それより前に消すと、9月分の穴埋めを締切内にやり直しているユーザーの導線（削除時の再計算・9月のカレンダー説明文）を壊す。
なお、次の2つは日付で自動的に無効化されているので、着手が遅れても実害は無い。

- 投稿時の自動割当: 投稿は必ず当月に入るため、2026-10-01 以降は到達しない
- 設定ページのトグル: 2026-10-01 から自動で非表示

## 対象の洗い出し

```bash
grep -rn "cleanup-2026-10" src scripts prisma
```

コード内の `TODO(cleanup-2026-10)` マーカーが削除対象。下のチェックリストはそれを種類ごとにまとめたもの。

## チェックリスト

### 削除するファイル
- [ ] `src/app/settings/AutoMakeupToggle.tsx`
- [ ] `src/lib/achievements/makeupAssign.ts`（`assignMakeupForNewPost` / `recomputeMonthMakeups`）
- [ ] `src/lib/achievements/makeupAssign.test.ts`

### `User.autoMakeup` の配管を外す
- [ ] `src/app/settings/page.tsx` — トグルの描画と `select.autoMakeup`
- [ ] `src/app/api/v1/me/route.ts` — PATCH の `autoMakeup` 受け付け・select・レスポンス
- [ ] `src/lib/auth/session.ts` — `SessionUser.autoMakeup` とその代入
- [ ] `src/lib/publish/publishImage.ts` — `PublishUser.autoMakeup` と投稿時の自動割当の分岐（`perfectMonthGrace` / `assignMakeupForNewPost` の import も）
- [ ] `src/app/api/v1/post/route.ts` / `src/app/api/v1/post/repost/[id]/route.ts` / `src/lib/queue/tasks.ts` / `src/lib/mention/processor.ts`（型と2か所の代入）— `autoMakeup:` の受け渡し
- [ ] テストのフィクスチャから `autoMakeup` を除去: `src/lib/auth/session.test.ts` / `src/lib/publish/publishImage.test.ts`（「自動穴埋めは 2026-09 以前の月だけ」の describe ごと）/ `src/lib/publish/repostImage.test.ts` / `src/app/api/v1/post/route.test.ts` / `src/app/api/v1/post/repost/[id]/route.test.ts`

### 画像削除時の旧ルール分岐
- [ ] `src/app/api/v1/images/[id]/route.ts` DELETE — 「旧era かつ autoMakeup」の `recomputeMonthMakeups` 分岐を消し、`healAfterImageDelete`（失効掃除）だけにする
- [ ] 同 route.test.ts — `autoMakeup` / `recomputeMonthMakeups` を前提にした DELETE のテストと `makeupAssign` のモックを除去

### 旧ルールの通知
- [ ] `src/lib/achievements/engine.ts` — `maybeNotifyMakeup`（makeup-reminder の作成）と呼び出し
- [ ] `src/lib/achievements/perfectMonth.ts` — `shouldRemindMakeup` / `MAKEUP_REMINDER_MAX_SKIPPED`（`perfectMonth.test.ts` の該当 describe も）
- [ ] `makeup-reminder` の **表示** は残す（既存の通知行が90日間は一覧に出るため）。`src/lib/makeup/notificationTypes.ts` の `LEGACY_REMINDER` は、最後の行が 2026-09-30 作成なので **2026-12-29 以降** に消してよい

### 旧ルールの文言（`pointEra === false` の分岐）
- [ ] `src/components/calendar/CalendarView.tsx` — 凡例の従来ルール説明・従来の穴埋め促しコールアウト（`PerfectMonthCallout`）と `legacyGrace` prop（`src/app/u/[username]/calendar/page.tsx` の受け渡しと `perfectMonthGrace` import も）
- [ ] `src/components/achievements/AchievementsView.tsx` / `CollectionMeter.tsx` / `NextGoals.tsx` — 従来ルールの文言分岐
- [ ] `src/app/api/v1/images/[id]/route.ts` PATCH — 「穴埋めは1か月に N 日までです」
- [ ] `src/app/docs/spec/page.tsx` — 「2026年9月分までの穴埋め」の節

  > 注意: 過去月（2026-09 以前）のカレンダーは今後も閲覧できる。上限の数字（3/4日）はポイント台帳から出せないので、`resolveMakeupCap` の旧ルール分岐・`perfectMonthGrace`（過去月の👑判定と穴埋め表示の上限に使う）は **残す**。消すのは「今月のルールとしての説明」だけ。

### スクリプト
- [ ] `scripts/backfill-makeups.ts` / `scripts/cleanup-overcap-makeups.ts` — 旧ルール専用の一度きりスクリプト。実行済みなら削除（`src/lib/achievements/README.md` の手順D からも記述を消す）
- [ ] `scripts/dev-perfect-month.ts` — `autoMakeup=false` の設定を削除

### スキーマ（**本番マイグレーションはユーザーが実行**）
- [ ] `prisma/schema.prisma` から `autoMakeup` を削除し、マイグレーションを追加:

  ```sql
  ALTER TABLE "users" DROP COLUMN "auto_makeup";
  ```

  コード変更をデプロイして `auto_makeup` を読むコードが無くなってから適用する（列が残っていても新コードは読まないので無害。逆順だと旧コードが壊れる）。適用後はコードのロールバック不可。
- [ ] `npx prisma generate`

### 仕上げ
- [ ] `npm test` / `npm run lint` / `npm run typecheck`
- [ ] `grep -rn "cleanup-2026-10" src scripts prisma` が0件（`makeup-reminder` 表示の撤去を後回しにした場合は、そのマーカーだけ残る）
- [ ] このファイルを削除し、`CLAUDE.md` のドキュメント索引から行を消す
