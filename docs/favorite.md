# お気に入り（Favorite）機能 仕様

お気に入りの取得タイミング（TTL）・定期同期（バックオフ／fire1・fire2）はロジックが入り組んでいるため、ここを正とする。値や条件を変えるときは必ずこことテストを更新すること。

## 1. 概要：お気に入りの「実体」

お気に入りは独自DBレコードではなく **Mastodon の favourite / Misskey の リアクション（❤️）そのもの**。連合上 favourite ⇔ リアクションは相互伝播するため、Mastodon⇔Misskey をまたいだお気に入りも成立する。

- **正データはオーナー（投稿者）インスタンス側**にある。サービスは `favoriteCount` と上位40件の一覧（`favoritersCache`）を**キャッシュ**として保持するだけ。
- 対象は「Mastodon/Misskey ユーザー＋ `postId` あり」の投稿のみ（`isFavoritable`）。local 投稿（Fediverse 未投稿）は対象外。公開範囲は public / unlisted のみなので、投稿自体は誰でも読める。

### トークンの使い分け
| 操作 | 使うトークン | 理由 |
|---|---|---|
| 読み取り（count / 一覧 上位40件） | **オーナー** | オーナーインスタンスが正データ |
| お気に入り 登録/解除（POST/DELETE） | **viewer** | 操作者本人として favourite/reaction する |

別インスタンスの投稿に操作するときは、毎回 `postUrl` を viewer 側で解決してから操作する（Mastodon: `/api/v2/search?resolve=true` → favourite、Misskey: `/api/ap/show` → reactions/create）。`localStatusId` はキャッシュしない割り切り。

## 2. データモデル（`Image`）

| カラム | 意味 |
|---|---|
| `favoriteCount` | 総お気に入り数（上位40件外も含む）のキャッシュ |
| `favoritersCache` | お気に入りした人 上位40件のスナップショット（JSON） |
| `favoritesSyncedAt` | 最後に同期を試みた時刻（成功・失敗いずれも更新） |
| `postStatus` | 最後の同期の HTTP ステータス。`200`=成功 / `0`=接続失敗 / `4xx`・`5xx`=失敗 / `429`=レート制限 / `null`=未同期 |

`favoritesSyncedAt` と `postStatus` は **常にペアで更新**される（成功時は `postStatus=200`、失敗時は失敗ステータス）。「`favoritesSyncedAt` が null ⇔ 一度も同期していない」が成立する。

## 3. ファイル構成

| ファイル | 役割 |
|---|---|
| [`src/lib/fediverse/favorite.ts`](../src/lib/fediverse/favorite.ts) | Fediverse への取得/操作の実体。`fetchFavoriteData` / `favoriteStatus` / `unfavoriteStatus`、`FavoriteError`、`classifyPostStatus`、エラー文言 |
| [`src/lib/fediverse/favoriteSync.ts`](../src/lib/fediverse/favoriteSync.ts) | `syncFavoriteCache()`。オーナートークンで取得→DBキャッシュ更新→通知差分更新。GET とも定期ジョブとも共用（sharp非依存＝worker-front可） |
| [`src/lib/fediverse/favoritePolicy.ts`](../src/lib/fediverse/favoritePolicy.ts) | **「いつ取りに行くか」の純粋ロジック**。`computeCacheTtl` / `shouldSyncOnGet`（GET）・`isFavoriteSyncDue`（定期）。I/Oなし・`now` 引数でテスト可能 |
| [`src/lib/fediverse/favoritePolicy.test.ts`](../src/lib/fediverse/favoritePolicy.test.ts) | 上記の単体テスト（TTL各帯・境界・fire1/fire2・バックオフ） |
| [`src/app/api/v1/images/[id]/favorite/route.ts`](../src/app/api/v1/images/[id]/favorite/route.ts) | GET（キャッシュ＋TTL切れ時sync）/ POST / DELETE |
| [`src/lib/periodic/index.ts`](../src/lib/periodic/index.ts) | `favoriteSyncJob`（定期フォールバック同期） |
| [`src/lib/notifications/favoriteNotifications.ts`](../src/lib/notifications/favoriteNotifications.ts) | 「お気に入りされた」通知の差分更新 |

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

`GET /api/v1/images/:id/favorite` は基本キャッシュを返すが、**stale なら同期してから返す**。判定は `shouldSyncOnGet()`：

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

## 6. 定期フォールバック同期（`favoriteSyncJob`）

画像詳細ページに**一度もアクセスが無い投稿**は GET 経由の同期に乗らない。これを 30分ごとの定期ジョブで拾う。発火条件の**正は `isFavoriteSyncDue()`（純粋関数・テスト済み）**。SQL（`FAVORITE_SYNC_WHERE`）はそれを DB 側で先に絞るための最適化で、取得後に `isFavoriteSyncDue()` で最終ゲートする（SQL と TS が万一ズレても TS が正）。

### 発火条件

共通足切り：
- 投稿から **1日以上**経過（`FALLBACK_MIN_AGE_MS`）
- かつ **未同期 or バックオフ経過**

バックオフ（直近同期の結果で変える）：

| 直近 postStatus | バックオフ |
|---|---|
| 200・未同期 | **12時間**（`FALLBACK_BACKOFF_MS`） |
| ≠200（4xx/5xx/429/0） | **1時間**（`FALLBACK_BACKOFF_FAILED_MS`） |

その上で **fire1 / fire2 のどちらかが立てば発火**：
- **fire1**: 1日経過後にまだ「1日マーク以降の成功同期」が無い → 投稿が落ち着いた頃の fav を1回拾う
- **fire2**: 14日経過後にまだ「14日マーク以降の成功同期」が無い → 成熟後の最終同期を1回拾い、以後停止

ここで「N日マーク以降の成功同期あり」＝ `postStatus===200 && favoritesSyncedAt >= createdAt + N日`（`hasSuccessfulSyncAfter`）。

### 「何度も繰り返さない」仕組み
成功(200)同期がその段（1日／14日）のマークを越えると、その段の fire は二度と立たない。
- 未閲覧の投稿でも **day1 と day14 で各1回ずつ**同期され、14日マーク以降の成功で恒久停止する。
- 失敗（≠200）は `postStatus` が 200 にならない限り fire が立ち続けるので、成功するまで**1時間間隔**で再試行される。

### 実行制御
- 1回の実行で最大 `FAVORITE_SYNC_BATCH = 30` 件（初回展開時の thundering herd 防止。`ORDER BY favorites_synced_at ASC NULLS FIRST` で未同期・古い順）。
- 同時実行 `FAVORITE_SYNC_CONCURRENCY = 1`（逐次）＋バッチ間 `FAVORITE_SYNC_GAP_MS = 500ms` ウェイト（連携先への集中・レート制限踏み抜きを回避）。

## 7. 停止条件の一貫性（重要）

GET（`computeCacheTtl` の Infinity）と定期（fire2）は、**同じ「14日マーク以降の成功同期があるか」で停止**するよう揃えている。これにより：

- 閲覧される投稿 → GET が 14日マーク以降に1回同期 → 以後 GET は Infinity で止まり、定期も fire2 が立たず止まる。
- 閲覧されない投稿 → 定期 fire2 が day14 で1回同期 → 以後止まる。GET で開かれても Infinity で再同期しない。

どちらの経路でも「14日超で一度同期できたら、それ以後は同期しない」が成立する。`MATURE_DAYS = 14`。

## 8. 同期処理（`syncFavoriteCache`）

オーナートークンで `fetchFavoriteData`（count＋上位40件）を取得し、成功なら `favoriteCount`/`favoritersCache`/`favoritesSyncedAt`/`postStatus=200` を更新、失敗なら `favoritesSyncedAt`/`postStatus=失敗ステータス` のみ更新。続けて「お気に入りされた」通知を差分更新する（失敗しても本体は止めない）。

楽観表示（POST/DELETE 直後の即時反映）は DB に保存しない。viewer 自身を一覧へ仮反映してレスポンスにのみ載せる（federation 遅延＋上位40件の壁による割り切り）。リロードするとオーナー同期が連合反映を持ってくるまで一旦消えることがある。

## 9. ログ（worker-front / web pod）

| ログ | 出る場所 | 条件 |
|---|---|---|
| `[favorite] synced imageId=… count=… favoriters=…` | worker-front | **定期ジョブ経由の成功時のみ**（`logSuccess`）。GET 経由の成功は無音（高頻度のため） |
| `[periodic] favorite-sync: candidates=処理/総数 synced=… failed=… (Nms)` | worker-front | 候補が1件以上ある実行で毎回（総数は LIMIT に当たったときだけ COUNT で算出＝backlog 可視化） |
| `[favorite] sync failed (status=…, reason=…): imageId=…` | worker-front / web | 想定内の `FavoriteError`（404/429/5xx 等）。**スタックトレースは出さない** |
| `[favorite] sync failed (unexpected): imageId=…` ＋ stack | worker-front / web | 想定外（タイムアウト・復号/DBエラー等）。調査用にスタックを残す |
| `[favorite] {favourite|unfavourite} failed (…)` | web | POST/DELETE 操作の失敗（同じく FavoriteError は1行・想定外はstack） |

ログ・`FavoriteError` の message は**英語**。ユーザー向け表示（`favoriteErrorMessage` / API レスポンス）は日本語。

## 10. リトライ間隔まとめ（429/5xx 失敗時）

| 経路 | リトライ間隔 |
|---|---|
| GET（ページ閲覧時） | 1時間（`computeCacheTtl` の 429/5xx→1時間） |
| 定期フォールバック | 1時間（失敗バックオフ） |

成功後の通常運用は GET=経過時間ベース、定期=12時間。

## 11. 変更時のチェックリスト
- `computeCacheTtl` / `isFavoriteSyncDue` を変えたら [`favoritePolicy.test.ts`](../src/lib/fediverse/favoritePolicy.test.ts) を更新（境界値を必ず含める）。
- 定期の発火条件を変えたら、`isFavoriteSyncDue`（TS・正）と `FAVORITE_SYNC_WHERE`（SQL・前段フィルタ）を**両方**直す。SQL は TS の**スーパーセット**であること（TS が拾う行を SQL が取りこぼさない）。
- 停止条件（14日マーク）は GET（Infinity）と定期（fire2）で**一致**させる。
