# API リファレンス

入力オプションの各値は [README](../README.md) 参照。

## POST /api/v1/generate
- multipart/form-data。パラメータは入力オプションの API値（image/text/position/font/color/size/output）。
- **レスポンス**: image/avif（バイナリ）。ヘッダー: Content-Type, Content-Length, Content-Disposition, Cache-Control。生成画像は連携先によらず常に AVIF（`output` は DB 列・UI ラベルにのみ使い、生成されるバイト列には影響しない）。
- **レート制限**（IP単位・[rateLimit.ts](../src/lib/rateLimit.ts)）: スライディングウィンドウ方式。超過で 429（Retry-After付き）。Web Pod 1台前提のインメモリ判定。
- **エラー**: `{ success: false, error: { code, message, suggestion?, requestId? } }`

## POST /api/v1/post
- multipart/form-data・**認証必須**（JWT）。
- パラメータ: image(生成済Blob), text, position/font/color/size/output（生成オプション）, mimeType, visibility(`public`/`unlisted`/`local`), altText(任意・画像の代替テキスト), replyTo(任意・スレッドに投稿する先の画像ID。見えない画像なら finalize 前に 400。ミュートでは拒否しない＝[リプライ仕様](./reply.md))。
- **撮影情報**（任意・クライアントが元画像から抽出して送る）: `cameraOption`(`none`/`show`/`detail`), `cameraMake`/`cameraModel`(show/detail時), `exifDetails`(detail時・[ExifDetails](../src/lib/exif/details.ts)のJSON文字列・サーバーが `sanitizeExifDetails` でホワイトリスト検証), `locationOption`/`gpsLatitude`/`gpsLongitude` 等。
- **処理**: S3アップロード → DB保存 → Fediverse投稿（local時はスキップ）。S3・DB に入るのは受け取った AVIF そのもので、**Mastodon へ送るときだけ** 投稿直前に JPEG へ変換する（[uploadFormat.ts](../src/lib/fediverse/uploadFormat.ts)・変換は compute の `/api/internal/transcode`）。変換結果は保存しない。
- **レート制限**（ユーザー単位・[postRateLimit.ts](../src/lib/postRateLimit.ts)）: 認証直後、重い画像処理の前に判定。①直近15分の投稿数 ②直近24時間の投稿数（上限は直近1週間の投稿数に応じて増える）の2窓を、Image履歴の1クエリで算出。超過で 429（Retry-After付き）。
- **レスポンス**: `{ success, imageId, imagePageUrl, postUrl?, fediverseError?, fediverseErrorStatus?, threadBroken, newAchievements }`。`threadBroken`＝Fediverse には投稿できたがリプライ先に繋げられず単独投稿になった（boolean・SHAMEZO 内では繋がっている）。クライアントは遷移先に `&thread=0` を付け、完了トーストで「スレッドの前の投稿が {server} で見つかりませんでした」と補足する（[threadBroken.ts](../src/lib/replies/threadBroken.ts)）。

## POST /api/v1/post/repost/[id]（認証必須・worker-front配信）
- 既に SHAMEZO に保存済みの画像を、改めて Fediverse へ投稿する（投稿失敗した画像と、`visibility=local` で最初から連合しなかった画像が対象＝どちらも `postId=null`）。body `{ visibility }`（`public`/`unlisted`・`local` は 400）。
- 対象条件は [repostImage.ts](../src/lib/publish/repostImage.ts): 本人の画像・未投稿・保存から `REPOST_MAX_AGE_MS`（7日）以内。再レンダリングはせず S3 の保存済み画像をそのまま使う。リプライ（`replyToId` あり）の画像は、親が連合済みなら Fediverse 上でも返信として投稿する。
- レート制限は `/api/v1/post` と同じ枠（[postRateLimit.ts](../src/lib/postRateLimit.ts)）。**レスポンス**: `{ success, postUrl?, fediverseError?, fediverseErrorStatus? }`（投稿だけ失敗したケースは 200＋`fediverseError`）。
- パスが `/api/v1/images/[id]/repost` ではなく `/api/v1/post` 配下なのは、Ingress が `/api/v1/post` を worker-front へ振っているため。保存済み AVIF を Mastodon 向け JPEG に変換する＝compute を呼ぶ必要があり、compute に到達できるのは worker-front だけ（[architecture.md](./architecture.md)）。

## POST /api/v1/ingest/email（内部API・worker-front配信）
- Cloudflare Email Workerから転送されたraw emailを処理（元画像をS3一時領域へ置き、生成〜投稿は consumer へ enqueue）。`X-API-Key` 認証・`X-Email-Prefix` でユーザー特定。
- 件名→オプション、本文→テキスト、添付→画像。デフォルトは「件名指定 > ユーザー設定 > ハードコード」。出力形式は連携インスタンスで自動決定。source: "email"。詳細は [メール投稿機能](./posting.md#メール投稿機能) 参照。

## GET/PUT/DELETE /api/v1/images/[id]/reactions
- **GET**（認証不要）: リアクションのチップ・ユーザー一覧・閲覧者の状態。`{ success, reactable, fediverseSendable, total, chips[], usersByEmoji, viewerEmoji, lastSyncedAt, syncError }`。`chips[]`＝`{ emoji, imageUrl, count, reactedByViewer }`（件数降順）。`Cache-Control: private, max-age=60`（viewer依存のため共有キャッシュ不可）。
- **PUT**（認証必須）: `{ emoji }` を設定（別の絵文字なら付け替え・1ユーザー1リアクション）。Mastodonは連合上 favourite しか送れないため選べるのはUnicode絵文字＋SHAMEZO独自カスタム絵文字（`:name@shamezo:`）で、どれを選んでもFediverseへは❤として伝わり絵文字の別はSHAMEZO DBにだけ残る。Misskeyは自サーバーのカスタム絵文字（`:name@host:`）も可。
- **DELETE**（認証必須）: リアクションを解除。
- PUT/DELETE のレスポンスは GET と同形（total / chips / usersByEmoji / viewerEmoji / syncError）。Fediverseへは本人トークンで送ってからDB記録する。
- 実体・マージ・同期・取り消し反映は [`docs/favorite.md`](./favorite.md) に集約。

## GET /api/v1/reactions/palette（認証必須）
- リアクションピッカーの候補絵文字。`q` なしでカテゴリ別の `sections[]`、`q=<query>` で名前・タグ横断検索の `emojis[]`＋`total`（1リスト）。各要素は `{ key, imageUrl, label }`。
- Misskeyユーザーは自サーバーのカスタム絵文字（先頭）＋Unicode、Mastodon/その他はSHAMEZO独自カスタム絵文字（先頭）＋Unicode。Misskeyのカスタム絵文字は `CUSTOM_SECTION_LIMIT` で打ち切り、超過は `truncated` で通知（検索に誘導）。SHAMEZO独自絵文字は自前登録なので打ち切らない。

## GET /api/v1/favorites（認証必須）
- パラメータ cursor, limit。レスポンス `{ images[], nextCursor, hasMore }`。自分が**リアクションした**画像一覧を最新順で取得（SHAMEZO上の`Reaction`＋Fediverse側で直接押した上位40件の `favoritersCache`）。

## GET /api/v1/public/users/[username]/calendar
- パラメータ year, month。レスポンスは `days`（日ごとの件数＋代表画像）と `hasPrevMonth`/`hasNextMonth`/`isPerfectAttendance`（皆勤賞）を含むカレンダー用月別データ。
- 日・今日・今月は**カレンダーの持ち主の記録日**（日付の区切り）で決める（[features.md「日付の区切り」](./features.md#日付の区切り)）。閲覧者の区切りやブラウザの時計は使わない。
- `perfectMonth`（未来月は null）: `achieved` / `isCurrentMonth` / `callout`（当月の穴埋め促し: `today`｜`ready`｜`tomorrow`｜`no-points`｜null）/ `filledDays`（穴埋め済みの日と埋めた写真）。
- **本人のときだけ**: `perfectMonth.makeup`＝その月の穴埋め枠 `{ pointEra, limit, used, remaining, deadline, editable, dayBoundaryHour, grants[] }` と、編集モード用の `ownerEdit`。キャッシュは `private, no-store`。
  - `deadline` は表示用の締切の排他上限（ISO）＝持ち主の区切りで締切の翌日が始まる時刻（0時区切りなら翌月11日 0:00 JST・2時区切りなら 11日 2:00）。編集できるかは `editable`（記録日で判定）を見る。
  - `dayBoundaryHour` は持ち主の今日の区切り（時）。説明文の「1日の区切り」に出す。
- `ownerEdit.nextMonthDayImages` は翌月1〜10日の画像（＝この月の穴を埋める donor 候補）。`dayImages` と別に返すのは、キーが日番号なので 10/3 と 11/3 を同じバケツに入れられないため。各画像の `makeupTargetMonth`（"YYYY-MM"）は、その写真がどの月の穴に使用中かを示す（1日1donor は月をまたいで共有するので日だけでは決まらない）。
- 穴埋めの上限は**カレンダーの持ち主**について解決する（2026-09 以前は所属インスタンスの固定値・2026-10 以降は穴埋めポイントの合計）。閲覧者に依存しないので、本人以外へのレスポンスは公開キャッシュしてよい。

## PATCH /api/v1/images/[id]（本人のみ）
- カレンダーの手動制御。body `{ calendarPicked?: boolean, makeupTargetDay?: number | null, makeupTargetMonth?: string }`（代表サムネの指定・解除／この写真で埋める穴の日の指定・解除）。
- `makeupTargetMonth`（"YYYY-MM"・省略＝写真と同じ月）は**どの月の穴か**。締切までなら翌月1〜10日の投稿でも前月の donor になれるため、日だけでは対象月が決まらない。解除（`makeupTargetDay: null`）では保存済みの割当から対象月を復元するので不要。写真の月でもその前月でもない値は 409。
- 日・月は写真の記録日（`Image.postDate`）で判定する（ダブル投稿・1日1代表・1日1donor・「穴より後」）。
- 穴埋め（`makeupTargetDay`）は、対象月の**翌月10日（持ち主の記録日）を過ぎると指定・解除とも 409**（0時区切りなら 11日 0:00・2時区切りなら 11日 2:00 から）。代表サムネの指定は締切と無関係。
- 上限超過は 409（2026-10 以降は「穴埋めポイントが足りません」）。検証〜書き込みはユーザー×月で直列化する（advisory lock・並行リクエストで上限を超えないため）。月またぎ donor では変更が2つの月に及ぶので、「写真の月」と「その前月」の両方をロックし、締切・上限・👑のガードも**変更が触れる月すべて**に対して回す。
- 皆勤賞を達成済みの月で、解除により非達成に落ちる変更は 409（別の写真への付け替えは可）。

## PUT /api/v1/me/day-boundary（本人のみ）
- body `{ hour }`（0〜4 の整数。それ以外は 400 `VALIDATION_INVALID`）。日付の区切りを変える。**翌日（まれに翌々日）から効く**（過去と今日の記録日は動かさない。規則は [features.md「日付の区切り」](./features.md#日付の区切り)）。
- レスポンス `{ success, todayHour, upcoming: [{ fromDate, hour }] }`。`upcoming` は今日より後に効く変更（最大2件・日付順）。画面には必ず日付つきで出す（「11/10から2時区切りになります（今日は0時区切りのままです）」）。
- 「読む→適用開始日を計算→書く」はユーザー単位の advisory lock で直列化する。web 配信（compute を使わない）。キャッシュは `private, no-store`。

## POST /api/v1/me/calendar/reevaluate（本人のみ）
- body `{ year, month }`。カレンダー編集モードの終了時に、その月の皆勤賞を再判定する（付与のみ・剥奪なし・冪等）。付与すると実績ポイント（+1pt・月1回）も付く。レスポンス `{ success, granted, key? }`。
