# リアクション（Reaction）機能 仕様

リアクションの取得タイミング（TTL）・定期同期（バックオフ／fire1・fire2）はロジックが入り組んでいるため、ここを正とする。値や条件を変えるときは必ずこことテストを更新すること。ファイル名は歴史的経緯で `favorite` だが、お気に入りを含むリアクション全体の仕様書。

## 1. 概要：リアクションの「実体」

SHAMEZO のリアクションは**2つの情報源をマージ**して表示する（[merge.ts](../src/lib/reactions/merge.ts)）:
- **オーナー（投稿者）インスタンス側**の Fediverse リアクション（Mastodon の favourite / Misskey のリアクション）。正データはあちらにあり、サービスは総数（`fediverseCount`）・絵文字別カウント（`reactionTotalsCache`）・上位40件の一覧（`favoritersCache`）を**キャッシュ**として持つだけ。
- **SHAMEZO の `Reaction` テーブル**。このサービス上で押されたリアクションの正データ。押した本人のトークンで Fediverse にも送る（下記）ため、二重計上しないよう表示時に acct でマージし、同じ人はこちらを正とする。

お気に入り（❤）はリアクションの一種で、正規化キー `FAVOURITE_KEY=❤`（[emojiKey.ts](../src/lib/reactions/emojiKey.ts)）。連合上 favourite ⇔ リアクションは相互伝播するため、Mastodon⇔Misskey をまたいでも成立する。

- **絵文字**: Misskey は任意の Unicode 絵文字＋自サーバーのカスタム絵文字（キー `:name@host:`）。**Mastodon は連合上 favourite しか送れない**ため選べるのは Unicode 絵文字＋SHAMEZO独自絵文字（下記）で、どれを選んでも Fediverse へは ❤（favourite）として伝わり、絵文字の別は SHAMEZO の DB にだけ残る。種別不明（Mastodon favourite・機能導入前の行）は `FAVOURITE_KEY(❤)` に寄せる。

### SHAMEZO 独自カスタム絵文字（Mastodon 向け）
Misskey ユーザーは自サーバーのカスタム絵文字を使えるが、Mastodon ユーザーは使えない。この非対称を埋めるため、**SHAMEZO が独自に持つカスタム絵文字**を Mastodon ユーザーがリアクションに使える。実装は [customEmoji.ts](../src/lib/reactions/customEmoji.ts) / `CustomEmoji` テーブル / 管理UI `/admin/emojis`。
- **内部キーは `:name@shamezo:`**（host は実ドメインと衝突しない予約センチネル `SHAMEZO_EMOJI_HOST`＝[emojiKey.ts](../src/lib/reactions/emojiKey.ts)）。他のカスタム絵文字と同じ `:name@host:` 形式なので merge・チップ描画・`parseCustomEmojiKey` がそのまま通る。オーナーキャッシュのキーは必ず実在ドメインを host に持つため文字列比較で確実に区別できる。
- **Mastodon 専用**（product 判断ではなく技術的必然）: Misskey ユーザーのリアクションは実際に自ノートへ送信されるが、`:name@shamezo:` は Misskey が解決できない。Mastodon は絵文字を連合送信せず DB にだけ残す（既存の Mastodon リアクションと同じ）ため成立する。よって**ピッカーに出す・押せるのは Mastodon viewer のみ**（[palette route](../src/app/api/v1/reactions/palette/route.ts)・`canViewerReactWith`）。**表示は全員**（emojiImageUrl は `Reaction` 行に載る＝viewer非依存。設定だけをゲートする）。
- **画像は自前ストレージに原本保存し、メディアプロキシを通さず直接配信**する。プロキシ（`/proxy/image.webp`）は 128px 単一WebPへ再エンコードしアニメーション(APNG/GIF)を潰すため。表示URLの出し分けは [`getReactionEmojiImageUrl`](../src/lib/avatar.ts)（SHAMEZOキーは原URLそのまま／それ以外はプロキシ）。CSP `img-src` はストレージ公開URLを許可済み（[src/proxy.ts](../src/proxy.ts)）。
- **入力フォーマット**（B案=原本保存・再エンコードしない）: PNG / APNG / GIF / WebP / JPEG / AVIF（横長・アニメーション可・3MBまで）。**SVG は XSS 回避のため不可**。寸法は縛らず、表示高さは CSS（`h-[1.3em]`＝[ReactionEmojiView](../src/components/reaction/ReactionEmojiView.tsx)）で固定。定数は customEmoji.ts。
- **管理**: 当面は管理者のみ登録（`/admin/emojis`）。`CustomEmoji.createdById`（null=管理者）を最初から持たせており、将来ユーザー登録を許すときの枠制限は `count(createdById)` で乗る。**使用済み（Reaction にキーが残る）絵文字はハード削除不可**＝チップが壊れるため `enabled=false` で soft-disable（画像配信は継続）。カタログはプロセス内メモ化し、登録/更新/削除で `invalidateShamezoEmojiCatalog()`。
- 名前は Reaction キーの charset と同じ `[a-zA-Z0-9_+-]`（グローバル一意）。カテゴリ・エイリアス（検索用）を持ち、ピッカーはカテゴリ別セクションで出す（Misskey カタログと同じ構造）。
- 対象は public / unlisted の投稿（誰でも読める）。Fediverse へ送れる（Mastodon/Misskey ユーザー＋`postId`/`postUrl` あり＝`isFediverseSendable`）投稿はオーナー同期＋DB記録、**local投稿**（Fediverse 未投稿）は送り先が無いので **DB だけで完結**する（リアクション自体は公開画像なら可能）。

### トークンの使い分け
| 操作 | 使うトークン | 理由 |
|---|---|---|
| 読み取り（count / 一覧 上位40件） | **なし（未認証GET）** | 対象は public/unlisted のみで誰でも読める。オーナーインスタンスが正データ。トークン不使用＝オーナーのトークン失効に強い |
| リアクション 設定/解除（PUT/DELETE） | **viewer** | 操作者本人として favourite/reaction する |

> 読み取りを未認証にしている割り切り: 限定連合モード（Mastodon `DISALLOW_UNAUTHENTICATED_API_ACCESS` 等）のインスタンスは未認証 API を 401/403 で弾く。その場合 count/一覧が取れず `forbidden` 扱いになるが、現状は速度・失効耐性を優先して未認証一本。必要になればオーナートークンへのフォールバックを足す（[[feedback_no_speculative_protection]]）。

リアクションの設定（PUT）は、**絵文字を変えるだけの付け替えでも毎回 Fediverse へ送る**。Mastodon は favourite に絵文字を持たないため「変更だけなら送り直さない」最適化ができそうに見えるが、`Reaction` 行があることは相手サーバーに favourite が残っている保証にならない（オーナー側で取り消された／local投稿時代に付いた行が再投稿で連合対象になった等）。送らずに DB だけ更新すると SHAMEZO 側にだけリアクションが残り、後の `reconcileRemovals`（§8）が消す＝ユーザーには理由不明の消失になる。favourite / リアクション作成は冪等なので毎回送って状態を揃える（別インスタンス投稿では解決＋favouriteの2リクエストになるが、一貫性を優先する）。

別インスタンスの投稿に操作するときは、毎回 `postUrl` を viewer 側で解決してから操作する（Mastodon: `/api/v2/search?resolve=true` → favourite、Misskey: `/api/ap/show` → reactions/create）。`localStatusId` はキャッシュしない割り切り。

## 2. データモデル

### `Image`（オーナー側キャッシュ）
| カラム | 意味 |
|---|---|
| `fediverseCount` | オーナー側の生の総数（favourite / リアクションの合計） |
| `favoriteCount` | **表示用の合計**（`fediverseCount` に SHAMEZO 上のリアクションをマージした値）。一覧の「＋N」が読む |
| `reactionTotalsCache` | 絵文字別カウントのキャッシュ（JSON）。Misskeyは全リアクションの内訳、Mastodonは `{ totals: { "❤": n } }` |
| `favoritersCache` | リアクションした人 上位40件のスナップショット（JSON・`emoji` フィールドで種別も持つ） |
| `favoritesSyncedAt` | 最後に同期を試みた時刻（成功・失敗いずれも更新） |
| `postStatus` | 最後の同期の HTTP ステータス。`200`=成功 / `0`=接続失敗 / `4xx`・`5xx`=失敗 / `429`=レート制限 / `null`=未同期 |

`favoritesSyncedAt` と `postStatus` は **常にペアで更新**される（成功時は `postStatus=200`、失敗時は失敗ステータス）。「`favoritesSyncedAt` が null ⇔ 一度も同期していない」が成立する。

### `Reaction`（SHAMEZO 上のリアクション）
- 1ユーザー1画像1リアクション（`@@unique([imageId, userId])`）。別の絵文字を押すと付け替え（upsert）。
- カラム: `imageId` / `userId` / `emoji`（正規化キー）/ `emojiImageUrl`（カスタム絵文字の表示URL・Unicodeは null）/ `createdAt`。
- 読み書きは [store.ts](../src/lib/reactions/store.ts)（sharp非依存＝worker-front可）。表示は必ず [merge.ts](../src/lib/reactions/merge.ts) でオーナー側キャッシュとマージする。

## 3. ファイル構成

| ファイル | 役割 |
|---|---|
| [`src/lib/fediverse/favorite.ts`](../src/lib/fediverse/favorite.ts) | Fediverse への取得/操作の実体。`fetchFavoriteData` / `sendReaction` / `removeReaction`、`FavoriteError`、`classifyPostStatus`、エラー文言 |
| [`src/lib/fediverse/favoriteSync.ts`](../src/lib/fediverse/favoriteSync.ts) | `syncFavoriteCache()`。オーナートークンで取得→DBキャッシュ更新→通知差分更新。GET とも定期ジョブとも共用（sharp非依存＝worker-front可） |
| [`src/lib/fediverse/favoritePolicy.ts`](../src/lib/fediverse/favoritePolicy.ts) | **「いつ取りに行くか」の純粋ロジック**。`computeCacheTtl` / `shouldSyncOnGet`（GET）・`isFavoriteSyncDue`（定期）。I/Oなし・`now` 引数でテスト可能 |
| [`src/lib/fediverse/favoritePolicy.test.ts`](../src/lib/fediverse/favoritePolicy.test.ts) | 上記の単体テスト（TTL各帯・境界・fire1/fire2・バックオフ） |
| [`src/app/api/v1/images/[id]/reactions/route.ts`](../src/app/api/v1/images/[id]/reactions/route.ts) | GET（キャッシュ＋TTL切れ時sync）/ PUT（設定・付け替え）/ DELETE。書き込みは本人トークンでFediverseへ送ってからDB記録 |
| [`src/app/api/v1/reactions/palette/route.ts`](../src/app/api/v1/reactions/palette/route.ts) | リアクションピッカーの候補絵文字（カテゴリ別 sections / `q` で検索） |
| [`src/lib/periodic/index.ts`](../src/lib/periodic/index.ts) | `favoriteSyncJob`（定期フォールバック同期。`reconcileRemovals` で取り消しも反映） |
| [`src/lib/notifications/favoriteNotifications.ts`](../src/lib/notifications/favoriteNotifications.ts) | 「リアクションされた」通知の差分更新 |

### リアクション固有（表示・絵文字）
| ファイル | 役割 |
|---|---|
| [`src/lib/reactions/`](../src/lib/reactions/) | 型・マージ・Reaction テーブル・取り消し判定・絵文字キー・Unicodeカタログ（[README](../src/lib/reactions/README.md)） |
| [`src/lib/reactions/customEmoji.ts`](../src/lib/reactions/customEmoji.ts) | SHAMEZO独自絵文字（`CustomEmoji`）のカタログ取得・検索・実在検証・アップロード制約定数 |
| [`src/app/api/v1/admin/emojis/`](../src/app/api/v1/admin/emojis/) | 管理者用の登録/一覧/enable切替/削除API。UIは [`/admin/emojis`](../src/app/admin/emojis/) |
| [`src/lib/fediverse/emojis.ts`](../src/lib/fediverse/emojis.ts) | Misskey 自サーバーのカスタム絵文字カタログ取得・検索・カテゴリ分け |
| [`src/components/reaction/`](../src/components/reaction/) | 詳細ページUI（チップ＋ポップオーバー＋ピッカー・[useReactionActions](../src/components/reaction/useReactionActions.ts) に操作集約） |

## 4. エラー分類

`classifyPostStatus(status)` が HTTP ステータス → 理由（`FavoriteErrorReason`）へ写像する。

| status | reason | ユーザー向け意味 |
|---|---|---|
| 2xx | （null＝成功） | — |
| 404 / 410 | `deleted` | 元投稿が削除された |
| 401 / 403 | `forbidden` | 権限不足（再ログインで解決し得る） |
| **429** | `unavailable` | レート制限（**5xx と同じ一時障害扱い**） |
| その他 4xx | `forbidden` | — |
| 5xx / 0(接続失敗) | `unavailable` | 連携先に接続できない |
| （解決できず） | `unresolved` | viewer 側にまだ投稿が未連合 |

Misskey は削除も権限不足も HTTP 400 で返すため、`classifyMisskeyError` がボディの `error.code`（`NO_SUCH_NOTE` 等）で判別し、Mastodon 相当のステータス（404/403）へ正規化する。

## 5. GET 時の取得判定（TTL）

`GET /api/v1/images/:id/reactions` は基本キャッシュを返すが、**stale なら同期してから返す**（この同期はオーナー側の取り消し反映も行う＝§8 `reconcileRemovals`）。判定は `shouldSyncOnGet()`：

```
未同期（favoritesSyncedAt = null）            → 必ず同期
それ以外                                       → (now - favoritesSyncedAt) > computeCacheTtl(...) なら同期
```

### `computeCacheTtl` の値

**(a) 直近が失敗していたら postStatus 優先（経過時間より先に判定）**

| 直近 postStatus | TTL |
|---|---|
| 429 / 5xx / 0(接続失敗) | **1時間** |
| 4xx（429除く） | **1日** |

**(b) 成功(200) / 未同期 → 投稿経過時間ベース**（fav が動きやすい投稿直後ほど短い）

| 投稿からの経過 | TTL |
|---|---|
| 5分以内 | 1分 |
| 1時間以内 | 5分 |
| 3時間以内 | 10分 |
| 1日以内 | 1時間 |
| 14日以内 | 1日 |
| **14日超** | **成熟後syncが既にあれば `Infinity`（＝停止）／無ければ `0`（＝即同期）** |

14日超の扱いは §7 の「停止条件」を参照。年齢だけで止めると、若い頃の同期しか無い古い投稿を開いたとき古い値が出続けるため、`favoritesSyncedAt` 基準で判定する。

POST/DELETE 成功時は TTL に関係なく**必ず即同期**する。

GET レスポンスには最終同期時刻 `lastSyncedAt`（ISO8601／未同期は null）を含む。また `Cache-Control: private, max-age=60` を付与してブラウザに60秒キャッシュさせる（`viewerEmoji` 等が viewer 依存のため共有キャッシュ不可＝`private`）。

## 6. 定期フォールバック同期（`favoriteSyncJob`）

画像詳細ページに**一度もアクセスが無い投稿**は GET 経由の同期に乗らない。これを 30分ごとの定期ジョブで拾う。発火条件の**正は `isFavoriteSyncDue()`（純粋関数・テスト済み）**。SQL（`FAVORITE_SYNC_WHERE`）はそれを DB 側で先に絞るための最適化で、取得後に `isFavoriteSyncDue()` で最終ゲートする（SQL と TS が万一ズレても TS が正）。

### 発火条件

共通足切り（この順に評価）：
- 投稿から **1日未満** → 対象外（`FALLBACK_MIN_AGE_MS`。動きが激しい時期は GET に任せる）
- 投稿から **16日超** → **恒久停止**（`FALLBACK_MAX_AGE_MS`。成功/失敗を問わずリトライしない）
- 直近が **429以外の4xx**（404 deleted / 403 forbidden 等）→ **定期リトライしない**（回復見込みが薄い）
- かつ **未同期 or バックオフ経過**

バックオフ（直近同期の結果で変える）：

| 直近 postStatus | バックオフ |
|---|---|
| 200・未同期 | **12時間**（`FALLBACK_BACKOFF_MS`） |
| 429 / 5xx / 0(接続失敗) | **1日**（`FALLBACK_BACKOFF_FAILED_MS`） |
| 429以外の4xx（404/403等） | **なし＝定期リトライ停止**（回復見込みが薄いため） |

> **バックオフは「必要条件」であって「十分条件」ではない**。バックオフ経過は「同期して *よい*」ゲートを通っただけで、実際に同期するかは下の fire1/fire2 が立つかで決まる。
> 例えば `200` の12時間は「最後の同期から12時間は再同期しない下限間隔」の意味だが、成功して落ち着いた投稿は fire1/fire2 が既にクリアされ手順の最後で止まるため、**この12時間バックオフが実際に効く場面は限られる**。
> 効くのは「成功はしたが、その段の fire がまだクリアされていない過渡期」。具体例: 投稿当日（day0.5）に誰かがページを開き GET が成功同期（day1 マーク *前* の成功）→ その後 day1 を過ぎて定期が回ると `fire1` はまだ立っているが、直近同期から12時間経つまではバックオフで待ち、12時間後の回で day1 の拾い直しをする。要は「fire が残っている過渡期の叩きすぎ防止」。

その上で **fire1 / fire2 のどちらかが立てば発火**：
- **fire1**: 1日経過後にまだ「1日マーク以降の成功同期」が無い → 投稿が落ち着いた頃の fav を1回拾う
- **fire2**: 14日経過後にまだ「14日マーク以降の成功同期」が無い → 成熟後の最終同期を1回拾い、以後停止（窓は実質 **[14, 16)日**）

ここで「N日マーク以降の成功同期あり」＝ `postStatus===200 && favoritesSyncedAt >= createdAt + N日`（`hasSuccessfulSyncAfter`）。

### 「何度も繰り返さない」仕組み
成功(200)同期がその段（1日／14日）のマークを越えると、その段の fire は二度と立たない。
- 未閲覧の投稿でも **day1 と day14 で各1回ずつ**同期され、14日マーク以降の成功で恒久停止する。
- 一時障害（429/5xx/0）は `postStatus` が 200 にならない限り fire が立ち続けるので、成功するか**16日を超えるまで1日間隔**で再試行される。
- **429以外の4xx**（deleted/forbidden 等）は定期リトライしない（GET でページを開いたときだけ同期される）。
- どの状態でも **投稿から16日を超えたら定期は恒久停止**する（失敗し続ける投稿を無限に叩かない上限）。

### 実行制御
- 1回の実行で最大 `FAVORITE_SYNC_BATCH = 30` 件（初回展開時の thundering herd 防止。`ORDER BY favorites_synced_at ASC NULLS FIRST` で未同期・古い順）。
- 同時実行 `FAVORITE_SYNC_CONCURRENCY = 1`（逐次）＋バッチ間 `FAVORITE_SYNC_GAP_MS = 500ms` ウェイト（連携先への集中・レート制限踏み抜きを回避）。

## 7. 停止条件の一貫性（重要）

GET（`computeCacheTtl` の Infinity）と定期（fire2）は、**同じ「14日マーク以降の成功同期があるか」で停止**するよう揃えている。これにより：

- 閲覧される投稿 → GET が 14日マーク以降に1回同期 → 以後 GET は Infinity で止まり、定期も fire2 が立たず止まる。
- 閲覧されない投稿 → 定期 fire2 が day14 で1回同期 → 以後止まる。GET で開かれても Infinity で再同期しない。

どちらの経路でも「14日超で一度同期できたら、それ以後は同期しない」が成立する。`MATURE_DAYS = 14`。

なお**失敗の扱いは経路で非対称**（成功時の停止は一致するが、失敗時は別々に止まる）:
- 定期は **429以外の4xx で即停止**・**16日超で恒久停止**（`FALLBACK_MAX_AGE_MS`）。無駄叩きを避けるため。
- GET はユーザーの明示操作なので、失敗しても `computeCacheTtl` の TTL（4xx=1日 / 429・5xx=1時間）で開かれるたびに再試行する（16日上限や4xx停止は適用しない）。

## 8. 同期処理（`syncFavoriteCache`）

未認証GETで `fetchFavoriteData`（count＋上位40件）を取得し、成功なら `favoriteCount`/`favoritersCache`/`favoritesSyncedAt`/`postStatus=200` を更新、失敗なら `favoritesSyncedAt`/`postStatus=失敗ステータス` のみ更新。続けて「お気に入りされた」通知を差分更新する（失敗しても本体は止めない）。

楽観表示（POST/DELETE 直後の即時反映）は DB に保存しない。viewer 自身を一覧へ仮反映してレスポンスにのみ載せる（federation 遅延＋上位40件の壁による割り切り）。リロードするとオーナー同期が連合反映を持ってくるまで一旦消えることがある。

### オーナー側で取り消されたリアクションの反映（`reconcileRemovals`）

SHAMEZO 上のリアクションは押した本人のトークンで Fediverse 側にも favourite/reaction を送っている（[favorite.ts](../src/lib/fediverse/favorite.ts) `sendReaction`）。よって「SHAMEZO の Reaction テーブルには残っているが、オーナー一覧に居ない acct」＝相手サーバー側で取り消された人、と判定できる（[reconcile.ts](../src/lib/reactions/reconcile.ts) `reactionsUnfavoritedOnOwner` → [store.ts](../src/lib/reactions/store.ts) `deleteReactions`）。

- **判定するのは GET（§5）と定期（§6）の同期**（`syncFavoriteCache(image, { reconcileRemovals: true })`）。**route の POST/DELETE 直後だけは対象外**＝連合がまだ伝播しておらず「自分が今付けたぶんを取り消しと誤検知」するため。操作後の遅延sync（5s/30s）も同じ理由で渡さない。
  - GET でも判定する理由: 定期の発火は fire1/fire2 の設計上 **day1 と day14 の各1回だけ**で、閲覧の多い投稿は GET 側が先に成功同期して fire1 を消すため、定期だけに任せると取り消しが最大13日反映されない（14日マーク以降は両経路とも停止するので永久に残る）。
- **一覧が40件フルの回は諦める**（41件目以降に隠れているだけかを区別できないため、その回はまるごと判定しない）。
- **作成から1時間（`UNFAVORITE_GRACE_MS`）未満のリアクションは対象外**（連合伝播の緩衝）。GET 経由の同期は投稿直後だと TTL 1分で回る＝定期の30分間隔よりはるかに早いため、相手サーバーの配送キューが詰まっていても届く長さを取る。
- ❤→👍 の**付け替えは対象外**（acct 自体は一覧に残るため消えない）。
- 削除は best-effort（失敗しても sync 本体は止めない。次の同期でまた判定できる）。

### リアクション起点の実績評価

リアクション関連の実績（はじめてのリアクション／カスタム絵文字リアクション／獲得したリアクション総数）は投稿の瞬間に確定しないため、リアクションが動く経路から評価する（[reactionTriggers.ts](../src/lib/achievements/reactionTriggers.ts)・仕様は[実績README](../src/lib/achievements/README.md) 手順C-2）。

- **押した側**: リアクションAPI の書き込み（PUT）で `setReaction` の直後（解除では評価しない）。
- **受け取った側**: `favoriteCount` を書き換えた瞬間＝この同期処理と、local投稿でルートが直接更新する箇所の2つ。**件数が増えた回だけ**評価する。
- どちらも例外は握り潰す（同期・リアクション操作を止めない）。`src/lib/achievements/*` は sharp/skia 非依存なので worker-front から呼んでも安全。

## 9. ログ（worker-front / web pod）

| ログ | 出る場所 | 条件 |
|---|---|---|
| `[favorite] synced imageId=… count=… favoriters=…` | worker-front | **定期ジョブ経由の成功時のみ**（`logSuccess`）。GET 経由の成功は無音（高頻度のため） |
| `[favorite] removed N unfavorited reaction(s): imageId=…` | worker-front / web | GET・定期同期でオーナー側の取り消しを検知し Reaction を削除したとき（`reconcileRemovals`。§8参照） |
| `[periodic] favorite-sync: candidates=処理/総数 synced=… failed=… (Nms)` | worker-front | 候補が1件以上ある実行で毎回（総数は LIMIT に当たったときだけ COUNT で算出＝backlog 可視化） |
| `[favorite] sync failed (status=…, reason=…): imageId=…` | worker-front / web | 想定内の `FavoriteError`（404/429/5xx 等）。**スタックトレースは出さない** |
| `[favorite] sync failed (unexpected): imageId=…` ＋ stack | worker-front / web | 想定外（タイムアウト・復号/DBエラー等）。調査用にスタックを残す |
| `[favorite] {favourite|unfavourite} failed (…)` | web | POST/DELETE 操作の失敗（同じく FavoriteError は1行・想定外はstack） |

ログ・`FavoriteError` の message は**英語**。ユーザー向け表示（`favoriteErrorMessage` / API レスポンス）は日本語。

## 10. リトライ間隔まとめ（失敗時）

| 経路 | 429 / 5xx / 0 | 429以外の4xx（404/403等） |
|---|---|---|
| GET（ページ閲覧時） | 1時間（`computeCacheTtl`） | 1日（`computeCacheTtl`） |
| 定期フォールバック | **1日**（失敗バックオフ） | **停止**（定期リトライしない） |

- 定期は加えて**投稿から16日超で恒久停止**（`FALLBACK_MAX_AGE_MS`）。
- 成功後の通常運用は GET=経過時間ベース、定期=12時間。

## 11. 変更時のチェックリスト
- `computeCacheTtl` / `isFavoriteSyncDue` を変えたら [`favoritePolicy.test.ts`](../src/lib/fediverse/favoritePolicy.test.ts) を更新（境界値を必ず含める）。
- 定期の発火条件を変えたら、`isFavoriteSyncDue`（TS・正）と `FAVORITE_SYNC_WHERE`（SQL・前段フィルタ）を**両方**直す。SQL は TS の**スーパーセット**であること（TS が拾う行を SQL が取りこぼさない）。
- 停止条件（14日マーク）は GET（Infinity）と定期（fire2）で**一致**させる。
- 定期の失敗停止（429以外の4xx即停止・16日恒久停止）は**定期のみ**の割り切り。GET は別（§7末尾の非対称を参照）。
