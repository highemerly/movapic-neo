# 実績（Achievement）・通知（Notification）機能

実績の追加・変更手順と、守るべき不変条件をまとめる。UI 文言の微調整以外で実績を触るときは必ずここを読むこと。

## 全体像

| ファイル | 役割 |
|---|---|
| `catalog.ts` | 実績定義（カタログ）・カテゴリ／表示順（`ACHIEVEMENT_LAYOUT`）・皆勤賞の動的評価。**サーバー/クライアント両方から import されるので React・サーバー専用APIを入れない**（型・`@/lib/streak`・`@/types` のみ） |
| `stats.ts` | live 用。投稿後に DB から集計（`collectStats`）して `AchStats` を作る |
| `engine.ts` | live 用。`evaluateAndGrant` が新規付与＋通知作成。`selectNewlyGranted` は純粋関数で live/backfill 共有 |
| `notifications.ts` | 通知フィード取得（直近90日の `Notification` をサムネ・リンク付きで返す） |
| `../publish/publishImage.ts` | 3経路（web/email/mention）すべての投稿後フック。`result.imageId` がある時だけ評価し、try/catch で投稿を止めない |
| `scripts/backfill-achievements.ts` | 既存ユーザーの過去投稿を**時系列リプレイ**して付与＋通知補填（メモリ集計版の stats） |
| `components/achievements/AchievementsView.tsx` | 実績タブの表示（`ACHIEVEMENT_LAYOUT` 駆動） |
| `components/achievements/AchievementIcon.tsx` | アイコン名 → lucide コンポーネントのマップ |

評価は「**ユーザー自身が投稿した瞬間**」に確定する条件のみ。しきい値はすべて **`>=`（到達で付与）**。一度付与した実績は**永続**（要件を満たさなくなっても剥奪しない）。

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

1. `catalog.ts` の `AchStats` にフィールド追加。
2. `stats.ts` `collectStats`（live・DBクエリ）で算出。クエリは `userId` スコープで数本に収める。`groupBy` は当 Prisma で `orderBy` 必須。
3. `scripts/backfill-achievements.ts` `replayUser`（backfill・メモリ集計）でも同じ値を running 集計として算出。
   - 「現在の連続日数」のような**その投稿時点**の値が要るものは、`new Date()` 基準の関数（`calculateStreak`）をそのまま使わず、投稿日基準で計算する（既存の `streakEndingAt` を参照）。
4. `PostFacts`（投稿そのものの属性）で足りるなら集計は不要。必要なら `PostFacts` に足し、`publishImage.ts` の `toPostFacts` と backfill の `ReplayImage`/select も合わせる。

## 手順D: 既存ユーザーへ反映（バックフィル）

```bash
DATABASE_URL="postgresql://..." npx tsx scripts/backfill-achievements.ts
```
- 冪等（実績は skipDuplicates、通知は achievementKey 既存分を除外）。何度流しても安全。
- 新しい実績の付与＋（過去日付きの）通知補填を行う。

## 手順E: 検証

```bash
npx tsc --noEmit          # 型
npx eslint <変更ファイル>   # lint（effect 内同期 setState 禁止などに注意）
npm run build             # 本番ビルド（新ルート・静的解析）
```
ローカル DB があれば手順D を流し、実績タブ・ベル・/notifications・写真詳細ページのバナーを目視確認。dev サーバーは Prisma クライアント更新時に**要再起動**。

## 特殊: 皆勤賞（動的キー）

月ごとに key が増える（`perfect-month:YYYY-MM`）ため CATALOG には入れず、`evaluatePerfectMonth` で評価する。実績タブでは `ACHIEVEMENT_LAYOUT` の `{ kind: "perfectMonth" }` ブロックが獲得月ぶんのカードを並べる。同様の「無限に増える系」を足すならこの方式に倣う。

## スキーマを変える場合（カラム追加など。通常は不要）

`prisma/schema.prisma` 編集 → `prisma migrate dev` → **`prisma generate`（必須）**。実績の追加自体は基本コードのみで完結し、スキーマ変更は不要。
