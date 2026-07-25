# API リファレンス

入力オプションの各値は [README](../README.md) 参照。

## POST /api/v1/generate
- multipart/form-data。パラメータは入力オプションの API値（image/text/position/font/color/size/output）。
- **レスポンス**: image/jpeg または image/avif（バイナリ）。ヘッダー: Content-Type, Content-Length, Content-Disposition, Cache-Control。
- **レート制限**（IP単位・[rateLimit.ts](../src/lib/rateLimit.ts)）: スライディングウィンドウ方式。超過で 429（Retry-After付き）。Web Pod 1台前提のインメモリ判定。
- **エラー**: `{ success: false, error: { code, message, suggestion?, requestId? } }`

## POST /api/v1/post
- multipart/form-data・**認証必須**（JWT）。
- パラメータ: image(生成済Blob), text, position/font/color/size/output（生成オプション）, mimeType, visibility(`public`/`unlisted`/`local`), altText(任意・画像の代替テキスト)。
- **撮影情報**（任意・クライアントが元画像から抽出して送る）: `cameraOption`(`none`/`show`/`detail`), `cameraMake`/`cameraModel`(show/detail時), `exifDetails`(detail時・[ExifDetails](../src/lib/exif/details.ts)のJSON文字列・サーバーが `sanitizeExifDetails` でホワイトリスト検証), `locationOption`/`gpsLatitude`/`gpsLongitude` 等。
- **処理**: S3アップロード → DB保存 → Fediverse投稿（local時はスキップ）。
- **レート制限**（ユーザー単位・[postRateLimit.ts](../src/lib/postRateLimit.ts)）: 認証直後、重い画像処理の前に判定。①直近15分の投稿数 ②直近24時間の投稿数（上限は直近1週間の投稿数に応じて増える）の2窓を、Image履歴の1クエリで算出。超過で 429（Retry-After付き）。
- **レスポンス**: `{ success, imageId, imagePageUrl, postUrl? }`

## POST /api/v1/ingest/email（内部API・worker-front配信）
- Cloudflare Email Workerから転送されたraw emailを処理（元画像をS3一時領域へ置き、生成〜投稿は consumer へ enqueue）。`X-API-Key` 認証・`X-Email-Prefix` でユーザー特定。
- 件名→オプション、本文→テキスト、添付→画像。デフォルトは「件名指定 > ユーザー設定 > ハードコード」。出力形式は連携インスタンスで自動決定。source: "email"。詳細は [メール投稿機能](./posting.md#メール投稿機能) 参照。

## GET/PUT/DELETE /api/v1/images/[id]/reactions
- **GET**（認証不要）: リアクションのチップ・ユーザー一覧・閲覧者の状態。`{ success, reactable, fediverseSendable, total, chips[], usersByEmoji, viewerEmoji, lastSyncedAt, syncError }`。`chips[]`＝`{ emoji, imageUrl, count, reactedByViewer }`（件数降順）。`Cache-Control: private, max-age=60`（viewer依存のため共有キャッシュ不可）。
- **PUT**（認証必須）: `{ emoji }` を設定（別の絵文字なら付け替え・1ユーザー1リアクション）。Mastodonは連合上 favourite しか送れないため選べるのはUnicode絵文字のみ（絵文字の別はSHAMEZO DBにだけ残る）。Misskeyは自サーバーのカスタム絵文字（`:name@host:`）も可。
- **DELETE**（認証必須）: リアクションを解除。
- PUT/DELETE のレスポンスは GET と同形（total / chips / usersByEmoji / viewerEmoji / syncError）。Fediverseへは本人トークンで送ってからDB記録する。
- 実体・マージ・同期・取り消し反映は [`docs/favorite.md`](./favorite.md) に集約。

## GET /api/v1/reactions/palette（認証必須）
- リアクションピッカーの候補絵文字。`q` なしでカテゴリ別の `sections[]`、`q=<query>` で名前・タグ横断検索の `emojis[]`＋`total`（1リスト）。各要素は `{ key, imageUrl, label }`。
- Misskeyユーザーは自サーバーのカスタム絵文字（先頭）＋Unicode、Mastodon/その他はUnicodeのみ。カスタム絵文字は `CUSTOM_SECTION_LIMIT` で打ち切り、超過は `truncated` で通知（検索に誘導）。

## GET /api/v1/favorites（認証必須）
- パラメータ cursor, limit。レスポンス `{ images[], nextCursor, hasMore }`。自分が**リアクションした**画像一覧を最新順で取得（SHAMEZO上の`Reaction`＋Fediverse側で直接押した上位40件の `favoritersCache`）。

## GET /api/v1/public/users/[username]/calendar
- パラメータ year, month。レスポンスは `days`（日ごとの件数＋最新画像）と `hasPrevMonth`/`hasNextMonth`/`isPerfectAttendance`（皆勤賞）を含むカレンダー用月別データ。
