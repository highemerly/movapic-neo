# 実績（Achievement）・通知（Notification）機能

実績の追加・変更手順と、守るべき不変条件をまとめる。UI 文言の微調整以外で実績を触るときは必ずここを読むこと。

## 全体像

| ファイル | 役割 |
|---|---|
| `catalog.ts` | 実績定義（カタログ）・カテゴリ／表示順（`ACHIEVEMENT_LAYOUT`）・皆勤賞の動的評価。**サーバー/クライアント両方から import されるので React・サーバー専用APIを入れない**（型・`@/lib/streak`・`@/types` のみ） |
| `perfectMonth.ts` | **皆勤賞ロジックの単一ソース**。上限 `grace`（＝その月に穴埋めできる日数。出所は問わない）を受け取る純粋関数群: 穴埋め割当の貪欲決定（`pickMakeupHole` / `assignMonthMakeups`）・達成判定（`isPerfectMonth`）・当月進捗（`currentMonthMakeupStatus`）・今すぐ割当可能か（`hasAssignableMakeup`）・促してよいか（`canPromptMakeup`）・日別集計。2026-09 以前の固定値 `PERFECT_MONTH_GRACE_*` と旧通知ゲート `shouldRemindMakeup` もここ。catalog 同様 React/サーバー専用APIを入れない。**穴埋め割当は Image.makeupTargetDay に永続化し、表示（カレンダー）も判定（皆勤賞）も同じ永続値を読む**＝表示と👑が食い違わない |
| `grace.ts` | 2026-09 以前の月の固定上限（`perfectMonthGrace(domain)` ＝ 特典サーバー4・その他3）。env を読むので perfectMonth.ts から分離。**月を問わず上限が欲しいときは `@/lib/makeup/ledger` の `resolveMakeupCap` を使う** |
| `makeupAssign.ts` | 2026-09 以前の月専用の自動穴埋め（`assignMakeupForNewPost` / `recomputeMonthMakeups`）。2026-10 以降は呼ばれない（[cleanup-2026-10](../../../docs/cleanup-2026-10.md) で削除予定） |
| `../makeup/*` | **穴埋めポイント制（2026-10〜）**。`points.ts`（純粋: era・付与量・締切・potentialCap）/ `donor.ts`（純粋: donor になれる範囲＝月またぎ・割当がどの月の穴を指すかの解決・月の割当状況の組み立て）/ `ledger.ts`（上限の解決・付与・直列化ロック）/ `awards.ts`（登録時・実績時の付与）/ `events.ts`（イベント一覧）/ `monthlyGrants.ts`（定期ジョブの月次・イベント付与）/ `notify.ts`（穴埋めを促す通知）/ `notificationTypes.ts`（通知の type・文言・遷移先）/ `selfHeal.ts`（画像削除後の失効掃除） |
| `stats.ts` | live 用。投稿後に DB から集計（`collectStats`）して `AchStats` を作る。リアクション起点の集計（`collectReactionStats`＝`ReactionStats`）もここ |
| `engine.ts` | live 用。`evaluateAndGrant`（投稿起点）/ `evaluateAndGrantReaction`（リアクション起点）/ `evaluateAndGrantProfile`（プロフィール起点）/ `evaluateAndGrantPerfectMonth`（皆勤賞の再判定・定期ジョブ）が新規付与＋通知作成。**付与はすべて `grantAll` を通す**（実績ptの付与フックがここにだけあるため）。`selectNewlyGranted*` は純粋関数で live/backfill 共有 |
| `reactionTriggers.ts` | リアクション起点のフック（`onReactionGiven` / `onReactionsReceived`）。例外を握り潰してリアクション操作・同期を止めない |
| `profileTriggers.ts` | プロフィール起点のフック（`onProfileUpdated`）。例外を握り潰してプロフィール保存を止めない |
| `notifications.ts` | 通知フィード取得（直近90日の `Notification` をサムネ・リンク付きで返す） |
| `../publish/publishImage.ts` | 3経路（web/email/mention）すべての投稿後フック。`result.imageId` がある時だけ評価し、try/catch で投稿を止めない |
| `scripts/backfill-achievements.ts` | 既存ユーザーの過去投稿を**時系列リプレイ**して付与＋通知補填（メモリ集計版の stats） |
| `components/achievements/AchievementsView.tsx` | 実績タブの表示（`ACHIEVEMENT_LAYOUT` 駆動） |
| `components/achievements/AchievementIcon.tsx` | アイコン名 → lucide コンポーネントのマップ |

評価タイミングは3系統ある（実績定義の `trigger` で区別。既定は `"post"`）。しきい値はすべて **`>=`（到達で付与）**。一度付与した実績は**永続**（要件を満たさなくなっても剥奪しない）。
- **投稿起点（`trigger` 省略）**: 「ユーザー自身が投稿した瞬間」に確定する条件のみ。集計は `AchStats`・投稿の属性は `PostFacts`。
- **リアクション起点（`trigger: "reaction"`）**: リアクションは投稿と無関係に増減するため、**リアクションが実際に動いた瞬間**に評価する。集計は `ReactionStats` のみ（`PostFacts` は無い）。
- **プロフィール起点（`trigger: "profile"`）**: 自己紹介は投稿にもリアクションにも紐づかないため、**プロフィールを保存した瞬間**に評価する。渡すのは保存後の実値 `ProfileFacts`（集計値ではない）。

各系統の評価ループは必ず型ガード（`isPostAchievement` / `isReactionAchievement` / `isProfileAchievement`）で絞る。「自分の系統以外を continue」で書くと、**trigger を増やしたとき既存ループへ漏れ込み、別の型の引数で `evaluate` が呼ばれる**。
**例外（皆勤賞のみ）**: 投稿以外でも皆勤賞だけ再判定する（`evaluateAndGrantPerfectMonth`・**付与のみ・剥奪なし**）。経路は2つ: ①カレンダー編集モードの終了時（`POST /api/v1/me/calendar/reevaluate`。手動で穴を埋めて皆勤を成立させたケース。2026-10 以降は穴埋めが手動のみなので常にこの経路）②定期ジョブの monthly-catchup（毎月11日以降、先月をデータから判定して確定させる。ビーコン頼みの①の取りこぼしを拾う安全網）。

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

## 手順C-2: リアクション起点の実績を追加する

投稿フック（`publishImage`）では確定しないため、専用の配管を通す。定義は `catalog.ts` に **`trigger: "reaction"` 付き**で書き、`evaluate` は `ReactionStats` だけを受ける（型は `ReactionAchievementDef`）。あとは単発なら手順A・段階なら手順B と同じ（`ACHIEVEMENT_LAYOUT` への追加を忘れない）。

評価される瞬間（**この2箇所以外に増やさない**。増やすと同じ実績が別経路で二重評価される）:

| 起点 | 呼び出し元 | フック |
|---|---|---|
| 押した側 | リアクションAPI の書き込み（`PUT /api/v1/images/:id/reactions`） | `onReactionGiven(userId, imageId)` |
| 受け取った側 | 表示用合計 `Image.favoriteCount` を書き換えた瞬間（`syncFavoriteCache` / local投稿はルート側の直接更新） | `onReactionsReceived({ ownerUserId, imageId, previousCount, currentCount })` |

- **受け取り側は「件数が増えた回」だけ評価する**。同期は閲覧のたびに走るため、増えていない回に集計クエリを撃たない。逆に言うと、実績が動くのは表示件数が動いたときだけ＝画面の数字と実績の数え方が常に一致する。
- 解除（DELETE）では評価しない（件数が減るだけで、実績は剥奪しない）。
- **リアクション起点の実績には「きっかけ写真」を紐づけない**（`Achievement.imageId` は押した側・受け取った側とも常に `null`。`evaluateAndGrantReaction` が強制）。画像詳細ページの「この投稿で獲得した実績」は `imageId` だけで引く（所有者で絞らない）ので、押した側だと他人の写真に自分の実績が並び、受け取った側でも「その写真を投稿したから獲得した実績」ではないものが投稿の実績として並んでしまう。通知の `imageId`（サムネ・遷移先）には当該写真を使ってよい。
- `ReactionStats` はいずれも**現在値**（リアクションは取り消し・付け替えができ履歴が無いため累計は復元できない）。実績は永続なので、一度到達すれば以後値が下がっても保持される。

## 手順C-3: プロフィール起点の実績を追加する

自己紹介（`User.bio`）のようにプロフィール保存でしか動かない条件は、定義を `catalog.ts` に **`trigger: "profile"` 付き**で書き、`evaluate` は `ProfileFacts`（保存後の実値）だけを受ける（型は `ProfileAchievementDef`）。あとは手順A と同じ（`ACHIEVEMENT_LAYOUT` への追加を忘れない）。

評価される瞬間は **`PATCH /api/v1/me`（bio の唯一の書き込み経路）だけ**。`onProfileUpdated` を経由し、例外はフック内で握り潰してプロフィール保存を止めない。バックフィルは履歴が無いため現在値で一括判定し、**grantedAt はスクリプト実行時刻**（受け取ったリアクションと同じ扱い＝通知はその日付で作られる）。

## 手順D: 既存ユーザーへ反映（バックフィル）

```bash
# 穴埋め機能の導入時は先に割当を populate（既存投稿へ makeupTargetDay を書く・一度きり）
DATABASE_URL="postgresql://..." npx tsx scripts/backfill-makeups.ts
# その後に実績付与（皆勤賞は永続割当を読んで判定）
DATABASE_URL="postgresql://..." npx tsx scripts/backfill-achievements.ts
```
- `backfill-makeups.ts`: 「そのユーザーに makeupTargetDay が1件も無い」ときだけ処理（移行済み/手動編集済みは丸ごとスキップ＝手動割当を絶対に上書きしない）。再実行安全。**2026-10 以降の月はスキップ**（ポイント制の月に貪欲割当すると自動穴埋めの復活になる）。
- `backfill-achievements.ts`: 冪等（実績は skipDuplicates、通知は achievementKey 既存分を除外）。何度流しても安全。皆勤賞は永続割当（makeupTargetDay）を読み、上限は**月ごとに**解決する（2026-09 以前は固定値・以降は台帳の合計）。**穴埋めポイントは付与しない**（実績ptを遡及させない）。
- リアクション起点は `replayReactions` が担当。押した側は `Reaction` を時系列リプレイするので **grantedAt は真の獲得日**、受け取った側は履歴が無いため現在値で一括判定し **grantedAt はスクリプト実行時刻**（通知もその日付で作られる＝ベルが光る）。
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

**達成条件（穴埋め制度・日付順）**: 「毎日投稿」ではなく「忘れた過去日を **"後日" の2枚以上投稿（ダブル投稿）** で穴埋めする」。ダブル投稿日 D は **D より前の未投稿日のみ** 埋められる（将来日は埋められない）。1日のダブルは1日分だけ（1日1donor）。donor は締切までなら**翌月1〜10日の投稿でもよい**（下記「月またぎ donor」）。
判定 `isPerfectMonth` は永続割当（`filledHoleDays`）を数え、`件数 >= missing(= 月の日数 - distinctDays)` かつ `missing <= grace` なら達成。`missing=0`（完全皆勤）は `grace` より先に短絡するので、**上限0でも完全皆勤なら常に成立**。

### 上限 `grace` の出所（2026-10 で切り替わった）

`perfectMonth.ts` の関数は `grace`＝「その月に穴埋めできる上限日数」を受け取るだけで、出所を問わない。解決は **`resolveMakeupCap` / `resolveMakeupLimits`（`@/lib/makeup/ledger`）の1か所**:

| 対象月 | 上限 | 割当 |
|---|---|---|
| 〜2026-09 | 所属インスタンスの固定値（`perfectMonthGrace`: 特典サーバー4・その他3） | `User.autoMakeup` が ON なら投稿時に自動（`assignMakeupForNewPost`） |
| 2026-10〜 | **穴埋めポイント**＝その月の `MakeupPointGrant.amount` 合計 | 全ユーザー手動のみ（カレンダー編集モード） |

呼び出し側（live=`evaluateAndGrant`、カレンダーAPI、コラージュ、PATCH、実績ページ、backfill）は必ずここで解決して渡す。`resolveCalendarMonth` は純粋関数のまま `makeupCap` を引数で受ける（台帳を読むために async 化しない）。

### 穴埋めポイント（2026-10〜）

- **1pt = 1日ぶんの穴埋め**。ポイントは対象月に紐づき、翌月に持ち越さない。
- **台帳は付与だけを持つ（`MakeupPointGrant`）。消費は `Image.makeupTargetDay` から導出する**。消費台帳を持つと、PATCH が1日1donor／1穴1donorのために指定外の割当も外す経路・画像削除・退会の各所で同期が要り、漏れると「カレンダーの穴埋め表示」と「残高」が食い違ってどちらが正か決められなくなる。残高が必要な箇所はどれも既にその月の画像を全件読んでいるので、導出のコストは実質ゼロ。
  - 派生的性質: ポイントは「消費」ではなく「占有」。穴埋めの解除や donor 画像の削除で戻り、締切内なら同月で使い直せる。
- **不変条件: 台帳は追記のみ・月内は単調非減少・月末で凍結。剥奪／マイナス補正は禁止**。過去月の上限が変わると、確定済みの👑とカレンダー表示が揺れる。
- 付与の経路（`(userId, month, reason)` 一意＝何度走っても二重にならない）:

  | reason | タイミング | 条件 | 量 | 実装 |
  |---|---|---|---|---|
  | `favor-monthly` | 定期ジョブ＋登録時 | FAVOR_SERVERS 所属（登録月も付与） | 1 | `monthlyGrants.ts` / `awards.grantSignupMakeupPoints` |
  | `monthly-catchup` | 定期ジョブ（11日以降） | 当月1日より前に登録・先月が皆勤でない（**データから再計算**） | 1 | `monthlyGrants.ts` |
  | `signup` | 登録時 | 常に（0pt なら行を作らない） | `min(登録日-1, 8)` | `awards.grantSignupMakeupPoints` |
  | `achievement` | 実績を付与した瞬間 | その月に1回 | 1 | `grantAll` → `awards.maybeGrantAchievementPoint` |
  | `event:<key>` | 定期ジョブ（イベントの期間中） | イベントごと（例: 開始時点で登録済み） | イベントごと | `events.ts` の一覧 → `monthlyGrants.ts` |

  - イベントは `src/lib/makeup/events.ts` に1件足すだけで配られる（キー・名前・付与先の月・量・開始日時・対象）。付与は開始日時以降かつ付与先の月の間だけ。表示名（付与履歴・通知）は一覧から引くので、**終わったイベントも一覧から消さない**。キーは台帳の reason になるのでリネーム・使い回し禁止。
  - 2026-10 の「穴埋めポイント開始記念」: 10月1日 0:00 JST 時点の登録者全員に1pt。

  - catchup の「先月が皆勤でない」を Achievement 行で見てはいけない。行の付与は編集モード終了時のビーコン頼みで、「数値上は皆勤なのに行が無い」状態が11日に存在しうる。行を信じると +1pt を受け取った後に👑も取れる（締切で塞いだ二重取りが残る）。ジョブはデータから判定し、皆勤なら👑をその場で確定付与する。
  - 実績ptは backfill から付与しない（過去日付の実績でポイントを遡及させない）。
- **締切: 対象月の翌月10日 23:59 JST（`isMakeupEditable`）**。新旧どちらの月にも適用。PATCH の割当の指定・解除をゲートする（代表サムネの指定はゲートしない）。締切が無いと「11日の catchup を受け取ってから先月を埋めて👑も取る」が成立する。`reevaluate` はゲートしない（付与のみ・締切後は割当が変わらないので結果が決定的）。
- **割当の書き込みはユーザー×月で直列化する**（`withMonthMakeupLock`＝advisory lock）。PATCH は「読む→上限を検証→書く」なので、残り1pt が常態のポイント制ではダブルタップで上限を超えうる。

### 月またぎ donor（翌月1〜10日の投稿で前月を埋める）

donor を同月に限ると**月末日を忘れた人だけが構造的に救済不能**だった（後日が無い）。締切は元々「翌月10日」なので、締切までに投稿されたダブル投稿は翌月のものでも donor にできる。これで「穴埋めできる上限」はポイント（cap）だけになり、月内に残ったダブル投稿の機会が暗黙の上限になる状態が消える。

- 表現は `Image.makeupTargetDay`（穴の日 1-31）＋ `Image.makeupTargetMonthDelta`（0=同月 / -1=前月）。**既存行は delta=0 で意味が変わらない**＝過去月の割当・👑は揺れない。
- 規則は [`src/lib/makeup/donor.ts`](../makeup/donor.ts) が単一ソース。`donorRange(ym)`＝「対象月の1日〜締切」の1本の範囲（DBクエリにそのまま渡せる）、`filledHoleOf(row, ym)`＝その行が対象月の穴を埋めているか、`buildMonthMakeupState(rows, ym)`＝日別枚数・有効な穴・donor のいる日。
- **1日1donor は月をまたいで共有する**。11/3 を10月の穴埋めに使ったら 11/3 は11月の穴埋めに使えない（共有しないと1回のダブル投稿で2日ぶん埋まり、1pt で2日得をする）。`donorDays` には「他の月の穴を埋めている donor」も入れる。
- **月またぎを許すのはポイント制の対象月だけ**（`allowsPrevMonthDonor`）。2026-09 以前は投稿時の自動割当（`recomputeMonthMakeups`）が同月だけを見て月の割当を組み直すため、月またぎ donor を知らずに同じ穴へ二重に割り当ててしまう。
- **filledHoleDays を組む側が月を解決する**。`perfectMonth.ts` の純粋関数は「対象月の日(1-31)」しか受け取らないので無変更。読む側（`stats.ts` / `engine.ts` / `resolveMonth.ts` / `notify.ts` / PATCH / backfill）が `donorRange` で読み `filledHoleOf` で振り分ける。**対象月の外の行は donor としてだけ効かせ、日別の投稿数・代表サムネには数えない**（11/3 を 10/3 の投稿として数えない）。
- PATCH は対象月を body の `makeupTargetMonth`（"YYYY-MM"・省略＝写真と同じ月）で受ける。日だけでは「11/3 の写真で 1日を埋める」が10月か11月か決まらないため。解除（`makeupTargetDay: null`）は保存済みの delta から対象月を復元する。
- PATCH のガードは**変更が触れるすべての月**に対して回す（`affected`）。1日1donor の月またぎ共有で「11月の穴を埋めるために、同じ日の写真が埋めていた10月の割当を外す」が起きるので、対象月だけを見ていると締切後の月を変えたり、確定した👑を崩したりしうる。ロックも「写真の月」と「その前月」の2つを昇順で取る。
- backfill のリプレイは、月またぎ donor を処理した時点で**前月の皆勤賞も評価する**（`evaluatePerfectMonth` は投稿した月しか見ないため、ここを通さないと取りこぼす）。

### 当月の進捗と「達成可能か」

`currentMonthMakeupStatus` は `grace`（今使える上限）と `potentialGrace`（月内にまだ付与されうる分を含む上限・`potentialCapOf`）を別々に受け取る。
- `remaining`（割当の可否・通知の可否）は `grace` で決める。
- `stillAchievable`（「今月は達成できません」表示・促すかどうか）は `potentialGrace` で決める。pitfall: `grace` で判定すると、月初に上限0のユーザーが1日休んだ瞬間に達成不可となり、11日に+1pt が来るまでコールアウトも通知も消えていた。
- `todayHasDonor` は**実際の割当の有無**で渡す。pitfall: 以前は `count(today) >= 2` で代用していた（自動穴埋めでは2枚目の投稿で donor が決まるので同値）。手動専用では「2枚投稿したがまだ割り当てていない」が常態で、コールアウトが即「明日2枚投稿しよう」になり「今すぐ穴埋めしよう」が出なかった。

### 画像削除時

- 2026-09 以前の月で `autoMakeup` が ON（かつ締切前）: 従来どおり `recomputeMonthMakeups` で月の割当を組み直す。
- それ以外: **失効掃除だけ**（`selfHeal.healAfterImageDelete`）。削除でその日が2枚未満になったら、その日の donor 割当を外す。代わりの写真を選んで付け替えることはしない（自動穴埋めの復活になる）。
  - pitfall: `countValidFilledHoles` は「穴が空き日か」しか見ず「donor の日がまだ2枚以上か」を見ない。従来は再計算が偶然掃除していたが、それが無いと「2枚投稿→穴埋め→1枚削除」で1pt で2日ぶん得をする。判定側に検証を足すと過去の👑月が非達成に見えるので、削除時に前向きに直す。
- 画像削除は常に成功させ（プライバシー優先）、👑（Achievement 行）はどちらの経路でも剥奪しない。**no-divergence 不変条件**: 達成済み(👑)月では、穴埋めの解除で非達成に落ちる PATCH を 409 で拒否する（別 donor への付替は可）。

### 通知

| type | 発火 | 重複排除 |
|---|---|---|
| `makeup-point` | 付与時（台帳と同一トランザクション） | 台帳の一意制約 |
| `makeup-need-second` | 投稿時: 今日1枚目・残りptあり・穴あり・達成可能 | 1日1通（JST の今日0時以降に同 type があれば送らない） |
| `makeup-ready` | 投稿時: 今日2枚目以上・今日の donor 無し（同条件）／付与直後: `hasAssignableMakeup` | 1日1通 |
| `makeup-reminder` | 2026-09 以前の月のみ（従来） | 月1通 |

- `achievementKey` には対象月キー `perfect-month:YYYY-MM` を入れる（通知から対象月のカレンダーへ飛ぶため）。日付は詰めない。
- 旧 `makeup-reminder` は導入時から `evaluateAndGrant` の「実績が1つも無ければ return」の後ろにあり、**その投稿で新しい実績を獲得したときしか評価されていなかった**。9月分は従来挙動のまま残し、新しい促し通知（`makeup-need-second` / `makeup-ready`）は実績の有無と無関係に毎投稿で評価する。
- 表示の文言・アイコン・遷移先は `@/lib/makeup/notificationTypes` の1か所から引く（ベルと通知一覧で二重に書かない）。通知一覧のカテゴリは、`achievementKey` を持っていても穴埋め系は「その他」に振る。

### カレンダー

- カレンダーAPI（`/api/v1/public/users/[username]/calendar`）は永続割当を読んで代表サムネ・穴埋め表示・👑を返す（オンザフライ貪欲は使わない）。上限は**持ち主について**解決するので、非ownerの公開キャッシュは安全。
- 本人（owner）にだけ `perfectMonth.makeup`（上限・使用・残り・締切・付与履歴）と編集用の候補（`ownerEdit`）を返し、キャッシュは private。UI はカレンダー上部の `MakeupPointsCallout` でこの値を使う（ページから固定の数字を渡さない＝月送りに追従）。常に出すのは「未投稿◯日 / 残り◯pt」の1行だけで、説明と「詳細なルール」「穴埋めポイント（獲得方法・付与と消費・持ち越し不可）」のモーダルは折りたたむ（スマホで上部が長くならないように）。カレンダー上の獲得方法・ルールは簡略版で、正確な条件は /docs/spec。
- 当月コールアウト `callout`: `today`（今日あと1枚で埋められる）/ `ready`（今日2枚済み・未割当＝今すぐ埋められる）/ `tomorrow`（今日は donor 使用済み）/ `no-points`（達成可能だがポイント0）。**画面に出すのは 2026-09 以前の月だけ**（ポイント制の月は上部を穴埋めポイントの案内に置き換えた）。

## スキーマを変える場合（カラム追加など。通常は不要）

`prisma/schema.prisma` 編集 → `prisma migrate dev` → **`prisma generate`（必須）**。実績の追加自体は基本コードのみで完結し、スキーマ変更は不要。
