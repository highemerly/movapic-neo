# 実績（Achievement）・通知（Notification）機能

実績の追加・変更手順と、守るべき不変条件をまとめる。UI 文言の微調整以外で実績を触るときは必ずここを読むこと。

## 全体像

| ファイル | 役割 |
|---|---|
| `catalog.ts` | 実績定義（カタログ）・カテゴリ／表示順（`ACHIEVEMENT_LAYOUT`）・皆勤賞の動的評価。**サーバー/クライアント両方から import されるので React・サーバー専用APIを入れない**（型・`@/lib/streak`・`@/types` のみ） |
| `perfectMonth.ts` | **皆勤賞ロジックの単一ソース**。しきい値（`perfectMonthGrace(domain)` ＝ ホーム handon.club は4・その他は3 / `MAKEUP_REMINDER_MAX_SKIPPED`）・穴埋め割当の貪欲決定（`pickMakeupHole`＝投稿1件ぶん / `assignMonthMakeups`＝月一括）・達成判定（`isPerfectMonth`）・当月進捗（`currentMonthMakeupStatus`）・穴埋め通知ゲート（`shouldRemindMakeup`）・日別集計（`summarizeDayCounts`）。catalog 同様 React/サーバー専用APIを入れない。**穴埋め割当は Image.makeupTargetDay に永続化し、表示（カレンダー）も判定（皆勤賞）も同じ永続値を読む**＝表示と👑が食い違わない。判定は `filledHoleDays`（永続割当が指す空き日）を数える（貪欲の再計算はしない） |
| `makeupAssign.ts` | 穴埋め割当を DB に書く side（サーバー専用）。`assignMakeupForNewPost`（投稿時に autoMakeup=true なら1件割当）/ `recomputeMonthMakeups`（削除後の自己修復で月を再割当）。純粋な割当規則は perfectMonth.ts に集約し、ここは橋渡しだけ |
| `stats.ts` | live 用。投稿後に DB から集計（`collectStats`）して `AchStats` を作る |
| `engine.ts` | live 用。`evaluateAndGrant` が新規付与＋通知作成。`selectNewlyGranted` は純粋関数で live/backfill 共有 |
| `notifications.ts` | 通知フィード取得（直近90日の `Notification` をサムネ・リンク付きで返す） |
| `../publish/publishImage.ts` | 3経路（web/email/mention）すべての投稿後フック。`result.imageId` がある時だけ評価し、try/catch で投稿を止めない |
| `scripts/backfill-achievements.ts` | 既存ユーザーの過去投稿を**時系列リプレイ**して付与＋通知補填（メモリ集計版の stats） |
| `components/achievements/AchievementsView.tsx` | 実績タブの表示（`ACHIEVEMENT_LAYOUT` 駆動） |
| `components/achievements/AchievementIcon.tsx` | アイコン名 → lucide コンポーネントのマップ |

評価は「**ユーザー自身が投稿した瞬間**」に確定する条件のみ。しきい値はすべて **`>=`（到達で付与）**。一度付与した実績は**永続**（要件を満たさなくなっても剥奪しない）。
**例外（皆勤賞のみ）**: カレンダー編集モードの終了時にも皆勤賞だけ再判定する（`POST /api/v1/me/calendar/reevaluate`・**付与のみ・剥奪なし**）。これは「③自動穴埋めOFFのユーザーが後から手動で穴を埋めて皆勤を成立させた」ケースを拾うため。③ON（貪欲最適）では投稿時に判定済みなので新規付与は起きない。

## 不変条件（壊すと既存データが壊れる）

- **`key` は永続。一度使った key の意味を変えない／リネームしない／使い回さない。** DB（`achievements.key`・`notifications.achievement_key`）に保存され、表示は key→CATALOG で解決される。文言だけ変えたいなら title/description を変えれば良い（key はそのまま）。
- `evaluate` は**純粋関数**（DB/IO 禁止）。集計は `AchStats`、投稿そのものは `PostFacts` から読む。
- 日付は必ず `@/lib/streak` の `toJstDateString` を使う（JST 一貫）。
- 通知は実績付与時に live でのみ作る。バックフィルの通知は「実績の獲得日（過去日）」付きで補填され、赤ドットは光らない（Cookie `not` 初回 now 初期化）。

## 手順A: 単発実績を追加する

1. `catalog.ts` の `singletons` 配列に追加:
   ```ts
   {
     key: "my-new-one",            // 一意・永続。例: "first-xxx"
     category: "my-new-one",       // 系列キー（グルーピング用。単発は key と同じでよい）
     rank: "silver",               // "gold" | "silver"（サマリーの金○銀○・カードのバッジ色）
     section: "デビュー",           // SECTIONS のいずれか
     // secret: true,              // 任意: 未達成のあいだ実績タブで「？？？」表示
     title: "タイトル",
     description: "説明",
     icon: "Star",                 // AchievementIcon のマップにある名前
     evaluate: (s, p) => /* 既存の AchStats / PostFacts だけで判定できるなら */ true,
   }
   ```
2. **`ACHIEVEMENT_LAYOUT` の該当セクションに `{ kind: "single", key: "my-new-one" }` を追加**（入れ忘れると実績タブに出ない）。
3. 新しいアイコンを使うなら `AchievementIcon.tsx` の import と `ICONS` マップに追加。
4. 判定に新しい集計が必要なら → **手順C**。
5. 検証（**手順E**）→ バックフィル（**手順D**）。

## 手順B: 段階実績（閾値違い）を追加する

例: `[5,10,20].map(...)` のように生成（`postCount` / `streak` / `featureUsage` 等を参考）。

1. `catalog.ts` に generator を追加。各 def に `ladderKey`（系列をまとめるキー）・`tier`（閾値）・`rank`（段ごとに `n >= X ? "gold" : "silver"`）を必ず付ける。
2. `LADDER_META` に `ladderKey: { label, unit }` を追加（カード見出しとバッジ単位）。
3. `CATALOG` の spread に generator を追加。
4. `ACHIEVEMENT_LAYOUT` に `{ kind: "ladder", ladderKey: "..." }` を追加。
5. 必要なら新集計（**手順C**）→ 検証 → バックフィル。

## 手順C: 判定に新しい集計値が必要なとき（重要・2箇所を必ず同期）

`AchStats` に項目を足したら、**live と backfill の両方**で同じ値を作ること。ズレると付与結果が食い違う。
（例: 皆勤賞の `postMonthDayCounts`（投稿月の日(1-31)→投稿数）と `filledHoleDays`（投稿月の永続穴埋め割当 Image.makeupTargetDay が指す空き日）は live=`stats.ts`・backfill=`replayUser` の双方で同形式に組み立て、`isPerfectMonth` に渡している。`filledHoleDays` は live では当月画像の makeupTargetDay を DB から読み、backfill では時系列リプレイで donor 投稿を処理した時点で running に積む。）

1. `catalog.ts` の `AchStats` にフィールド追加。
2. `stats.ts` `collectStats`（live・DBクエリ）で算出。クエリは `userId` スコープで数本に収める。`groupBy` は当 Prisma で `orderBy` 必須。
3. `scripts/backfill-achievements.ts` `replayUser`（backfill・メモリ集計）でも同じ値を running 集計として算出。
   - 「現在の連続日数」のような**その投稿時点**の値が要るものは、`new Date()` 基準の関数（`calculateStreak`）をそのまま使わず、投稿日基準で計算する（既存の `streakEndingAt` を参照）。
4. `PostFacts`（投稿そのものの属性）で足りるなら集計は不要。必要なら `PostFacts` に足し、`publishImage.ts` の `toPostFacts` と backfill の `ReplayImage`/select も合わせる。

## 手順D: 既存ユーザーへ反映（バックフィル）

```bash
# 穴埋め機能の導入時は先に割当を populate（既存投稿へ makeupTargetDay を書く・一度きり）
DATABASE_URL="postgresql://..." npx tsx scripts/backfill-makeups.ts
# その後に実績付与（皆勤賞は永続割当を読んで判定）
DATABASE_URL="postgresql://..." npx tsx scripts/backfill-achievements.ts
```
- `backfill-makeups.ts`: 「そのユーザーに makeupTargetDay が1件も無い」ときだけ処理（移行済み/手動編集済みは丸ごとスキップ＝手動割当を絶対に上書きしない）。再実行安全。
- `backfill-achievements.ts`: 冪等（実績は skipDuplicates、通知は achievementKey 既存分を除外）。何度流しても安全。皆勤賞は永続割当（makeupTargetDay）を読んで判定する。
- 新しい実績の付与＋（過去日付きの）通知補填を行う。

## 手順E: 検証

```bash
npx tsc --noEmit          # 型
npx eslint <変更ファイル>   # lint（effect 内同期 setState 禁止などに注意）
npm run build             # 本番ビルド（新ルート・静的解析）
```
ローカル DB があれば手順D を流し、実績タブ・ベル・/notifications・写真詳細ページのバナーを目視確認。dev サーバーは Prisma クライアント更新時に**要再起動**。

## 特殊: 皆勤賞（動的キー・穴埋め制度）

月ごとに key が増える（`perfect-month:YYYY-MM`）ため CATALOG には入れず、`evaluatePerfectMonth` で評価する。実績タブでは `ACHIEVEMENT_LAYOUT` の `{ kind: "perfectMonth" }` ブロックが獲得月ぶんのカードを並べる。同様の「無限に増える系」を足すならこの方式に倣う。

**達成条件（穴埋め制度・日付順）**: 「毎日投稿」ではなく「未投稿を grace 日まで許容し、忘れた過去日を **同月の "後日" の2枚以上投稿（ダブル投稿）** で穴埋めする」。
**grace は投稿者の所属インスタンスで決まる**（`perfectMonthGrace(domain)`：ホームインスタンス handon.club は4日・その他は3日。サービス発祥の handon.club を少しだけ優遇）。判定・進捗・カレンダー注意書きはすべて **その実績の持ち主（投稿者本人）の所属ドメイン** 基準で grace を解決する（閲覧者ではない）。
穴埋めは日付の前後を見る: ダブル投稿日 D は **D より前の未投稿日のみ** 埋められる（将来日は埋められない＝月末日を忘れると後日が無く埋まらない）。1日のダブルは1日分だけ。

**穴埋め割当は永続化する（表示と👑の単一ソース）**: 割当（どの投稿がどの空き日を埋めるか）は `Image.makeupTargetDay` に書き、カレンダー表示も皆勤賞判定も同じ永続値を読む。書き込み経路は ①投稿時の自動割当（`assignMakeupForNewPost`・autoMakeup=true のみ）②カレンダー編集モードの手動指定（`PATCH /api/v1/images/[id]`）③既存分の一括 populate（`scripts/backfill-makeups.ts`）。判定 `isPerfectMonth` は永続割当（`filledHoleDays`）を数え、`件数 >= missing(= 月の日数 - distinctDays)` かつ `missing <= grace` なら達成。`missing=0`（完全皆勤）は常に成立し後方互換。

**投稿は createdAt 単調増加で過去日には投稿できない**ため、投稿時の逐次割当（`pickMakeupHole`）は一括再計算（`assignMonthMakeups`）と必ず一致する＝③ON既存ユーザーの割当・👑は従来（オンザフライ貪欲）と不変。**grace 上限のルールは `perfectMonth.ts` の中だけが持つ**（`isPerfectMonth` の `missing <= grace`／表示件数の上限はカレンダーAPI側で `slice(0, grace)`）。

**③自動穴埋め設定（User.autoMakeup）**: true(既定)=投稿時に自動割当。false=自動割当せず編集モードで指定した穴だけ埋める。切替は**過去の割当・👑に影響しない**（未来の投稿の自動判定のみ切替）ので、切替時の再判定は不要。**no-divergence 不変条件**: 達成済み(👑)月では穴埋めの解除（un-assign）で非達成に落ちる変更を PATCH が 409 で拒否（別donorへの付替は可）。画像削除は常に許可（プライバシー優先）で、削除後は `recomputeMonthMakeups` が別donorで埋め直す（埋まらなければ穴のまま・👑維持）。

- 判定・進捗・しきい値・通知ゲートはすべて `perfectMonth.ts` に集約。catalog/stats/backfill/カレンダーAPI/engine は **必ずここを呼ぶ**（式を各所に再実装しない）。grace は呼び出し側が `perfectMonthGrace(投稿者ドメイン)` で求めて渡す（live=`publishImage`→`evaluateAndGrant` が `input.user.instance.domain`、backfill=ユーザーの `instance.domain`、カレンダーAPI=`parseUserHandle` の domain）。
- カレンダーAPI（`/api/v1/public/users/[username]/calendar`）は**永続割当（Image.makeupTargetDay / calendarPickedAt）を読んで**代表サムネ・穴埋め表示・`isPerfectMonth`（👑）を返す（オンザフライ貪欲は使わない）。表示の穴埋めは holeDay 昇順・grace 件までに cap。当月コールアウトは `currentMonthMakeupStatus`（永続割当ベース）。owner（本人）閲覧時だけ編集モード用の候補画像（`ownerEdit`）を返し、キャッシュは private にする。未来月以外（過去月・当月）で計算。
- カレンダーUI: 2枚以上投稿した日（穴埋め元）は金リング＋枚数バッジ。**埋まった空き日**は「埋めた日の2枚目に投稿した写真」をサムネにして緑（透明度高め）で塗り、右上に「{何日}日」を出し、その画像ページへリンクする。当月で未埋めの穴が残り皆勤がまだ可能なら穴埋めを促すコールアウト（`callout`: `"today"`＝本日2枚で埋められる／`"tomorrow"`＝今日は穴埋め済みなので翌日）を出す。

**穴埋め推奨通知（type=`makeup-reminder`）／カレンダー注意書き**: 通知は `shouldRemindMakeup(skippedSoFar, unfilled)`（未投稿1日以上・まだ埋まっていない穴がある・`skippedSoFar <= MAKEUP_REMINDER_MAX_SKIPPED`(=5)）で出す。`unfilled` は `currentMonthMakeupStatus` の日付順マッチングで厳密に数える。
- 通知: live の `evaluateAndGrant` 内 `maybeNotifyMakeup` が投稿した瞬間に評価し1件作る。重複排除は `achievementKey = perfect-month:YYYY-MM` で **月1通**。描画（ベル・/notifications）は `type` で分岐し、`achievementKey` を実績解決せず専用文言＋カレンダー遷移にする。backfill では送らない。投稿を止めないよう `.catch` で握りつぶす。
- カレンダー注意書き: API が `perfectMonth.callout` を返し、UI はそれだけを見て出す（達成/未達成メッセージは出さず、達成は月見出しの👑で示す）。穴埋め制度の説明文をカレンダー下にも常時表示。

## スキーマを変える場合（カラム追加など。通常は不要）

`prisma/schema.prisma` 編集 → `prisma migrate dev` → **`prisma generate`（必須）**。実績の追加自体は基本コードのみで完結し、スキーマ変更は不要。
