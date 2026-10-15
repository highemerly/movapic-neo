# リプライ（スレッド）

自分または他人の任意の投稿に、画像投稿でリプライ（UI 上の呼び名は「スレッドに投稿」）できる。連鎖可（1→2→3）。

## データ
- `Image.replyToId`（自己リレーション `ImageReplies`・`onDelete: SetNull`・`@@index([replyToId])`）。null=単独投稿。
- 親が削除されたら SET NULL で**痕跡なく単独投稿に戻る**（仕様: 削除されたリプライ先は何も表示しない）。退会（User→Image CASCADE）でも同じ。
- 親が管理者に取り下げ（`isDisabled`）られた場合は行を残し、**表示クエリの where で落とす**（復元すれば再表示）。

## 投稿経路
| 経路 | 指定方法 | 繋ぐ先 | 繋ぐ先が無いとき |
|---|---|---|---|
| Web | 画像詳細メニュー「スレッドに投稿」→ `/create?replyTo=<imageId>` → FormData `replyTo` | 指定した画像（自分・他人どちらも） | `/create` で「見つかりません。通常の投稿になります」表示／API は finalize 前に 400 |
| Bot | コマンド `連` | 投稿者本人の直近の投稿 | Bot がエラーをリプライ（恒久エラー） |
| メール | 件名 `連` | 投稿者本人の直近の投稿 | 通常の単独投稿（返信経路が無く、エラーにすると写真が無言で失われるため）＋warn ログ |

- 通常の `/create` から直接リプライはできない（メニュー経由のみ）。ゲストはメニュー項目が出ない（`canThread={!!currentUser}`）。
- 検証は [`findReplyableImage`](../src/lib/replies/target.ts)（`isPublic && !isDisabled`）。**ミュートでは拒否しない**（拒否するとミュートされていることが本人に分かる）。
- 「連」の繋ぐ先は [`findLatestOwnImageId`](../src/lib/replies/target.ts): **必ず userId（投稿者本人）で絞る**＝他人の投稿に繋がる経路は無い。取り下げ済みは飛ばし、`createdAt desc, id desc` の先頭。経路（Web/メール/Bot）・local かどうかは問わない。
- 「直近」は**ジョブの処理時点**で決まる。メール処理の遅延中に Web 投稿すれば、その Web 投稿に繋がる。
- **直列化**: Bot・メールのジョブは送信者ごとの `queueName`（`mention:<Botサーバー上のaccount id>` / `email:<userId>`）で直列に処理し、連投の 1→2→3 の順を保つ（[queue/index.ts](../src/lib/queue/index.ts)）。限界: メール×Bot×Web の同時投稿、backoff 中ジョブの後続による追い越しは防げない（その場合も繋がる先は本人の別投稿）。空になったキュー行は定期ジョブ `queue-cleanup` が掃除する。

## Fediverse 上のスレッド
- 両方が Fediverse に投稿されている場合だけ、Mastodon `in_reply_to_id` / Misskey `replyId` で繋ぐ（[post.ts](../src/lib/fediverse/post.ts)）。
- 返信先 ID は**投稿者自身のサーバー上の ID** が要る。[`resolveFediverseReplyTarget`](../src/lib/replies/fediverseTarget.ts) が解決する（throw しない）:
  - 同じサーバー → `Image.postId` をそのまま
  - 別サーバー → Mastodon `search?resolve=true`（[mastodon.ts](../src/lib/fediverse/mastodon.ts)）／Misskey `ap/show`（[misskey.ts](../src/lib/fediverse/misskey.ts)）。タイムアウト `REPLY_RESOLVE_TIMEOUT_MS`=5秒（同期 `/api/v1/post` の504に近づけないため、お気に入りの10秒より短い）。
- 解決は S3 保存と**並行**させる（`/api/v1/post` の応答時間に上乗せしない。全経路とも先に保存する）。local は解決しない。
- 再投稿（[repostImage.ts](../src/lib/publish/repostImage.ts)）でも親が連合済みなら繋ぐ（local で作ったスレッドを後から連合させても切れない）。
- 本文に相手への **@メンションは入れない**。Mastodon では他人宛のメンション無しリプライは公開TL・ローカルTLに出ず、フォロワーのホームにも両方をフォローしている人にしか出にくい。相手の Fediverse 側にも通知されない（SHAMEZO の通知でお知らせする）。Misskey は親が home（非収載）だと返信も home に格下げされる。

### 繋げられないケース
`ReplyLink.reason` で原因を型で区別する。投稿自体は止めない（止めると web は postId=null で保存され重複投稿・再投稿の手間を招く）。

| 状況 | 結果 | 利用者への表示 |
|---|---|---|
| 親が連合していない（local・投稿失敗）`parent-not-federated` | SHAMEZO 内だけ繋ぐ | なし（仕様どおり） |
| 解決時点で親が無い `parent-gone` | 単独投稿（replyToId も null） | なし |
| viewer のサーバーで見つからない `unresolved`／往復失敗 `resolve-failed` | Fediverse は単独投稿・SHAMEZO 内は繋ぐ | 完了トーストに「スレッドの前の投稿が {server} で見つかりませんでした」（`threadBroken`→`&thread=0`）・Bot は debug 時のみ |
| 投稿時に返信先が無効と応答（`replyDropped`） | アップロード済みメディアで返信なしに1回だけ送り直す | 同上 |

- 利用者への文言は原因によらず1つ（[threadBroken.ts](../src/lib/replies/threadBroken.ts)）。「削除されていました」と言い切ると、見つけられなかっただけ（連合の未反映など）の場合に誤りになるため。ブロックされて見えない場合も同じ文言になる（ブロックを本人に伝えない）。原因は下記の構造化ログで区別する。
- 送り直すのは**返信先が原因と確定できる応答だけ**: Mastodon `in_reply_to_id` 付きの 404（`{"error":"あなたが返信しようとしている投稿は存在しないようです。"}`・handon.club で実応答を確認済み。メディア不正は 422 で区別）、Misskey `NO_SUCH_REPLY_TARGET` / `CANNOT_REPLY_TO_AN_INVISIBLE_NOTE` / `YOU_HAVE_BEEN_BLOCKED`。親が Fediverse 側だけ削除されると、放置すれば以後の「連」が恒久失敗するため。
- 構造化ログ: `[reply] posted without thread` / `[reply] resolve failed` / `[fediverse:mastodon] status.reply_target_invalid` / `[fediverse:misskey] note.reply_target_invalid`。

## 表示（画像詳細）
**直接の前後だけ**を出す（スレッド全体は辿らない）。アカウント名や挿入コメントは出さず、写真で示す。
- 画面上の呼び名は「スレッド」（＝リプライ先のラベル）・「スレッドの続き」（＝この写真へのリプライ）に揃える（「リプライ」と「スレッド」を混在させない。コード・DB 上の名前は reply のまま）。
- リプライ先（[ThreadParent](../src/app/u/[username]/status/[imageId]/ThreadLinks.tsx)）: 画像の直上に「スレッド（@xxx）」＋**原本の写真を本画像の半分の大きさ**で出す（幅 1/2・縦長は高さ 36vh から幅を逆算して絞る）。写真の下端中央から本画像の上端へ細い縦線を引き、続きであることを示す。原本なので `RetryImage`。ALT があれば本画像と同じ「ALT」バッジ（`AltTextReveal`）を重ねる（バッジはボタンなのでリンクの外に重ね、ラベルと写真を別々のリンクにする）。押すとその写真へ移動。前の写真の投稿者が本画像と同じ（セルフスレッド・「連」）なら ID を省いて「スレッド」だけにする（投稿者は本画像の下に出ている）。長い ID は1行で省略。アイコンは `CornerUpLeft`（本画像＝下から前の写真＝上へ戻る向き）。
- スレッドの続き（[ThreadRepliesMeta](../src/app/u/[username]/status/[imageId]/ThreadRepliesMeta.tsx)）: メタ行（投稿日時などの行）に「スレッドの続き N件」だけを出す。押すとその写真（保存サムネ）を3列の格子で並べたダイアログが開き、写真を押すとその投稿へ移動する。古い順・上限30件で「ほかにも続きがあります」。件数は一覧と同じ条件で数える。
- 見えないもの（削除・取り下げ・**閲覧者のミュート相手**）はクエリで落とす＝痕跡を出さない（件数にも含めない）。
- 小プレビューの列・URL は [navImage.ts](../src/app/u/[username]/status/[imageId]/navImage.ts)（前後ナビと共有）。
- タイムライン一覧にはリプライである旨を出さない。

## ミュート
既存の方針（リアクション・favorite 通知）と同じく、**muter の視界からだけ読み取り時に隠す**。A が B をミュート中に B が A へリプライした場合:
- B の投稿は普通に成功し、Fediverse 上でも通常どおり繋がる（B からは何も変わらない＝バレない）。
- A の画像詳細のリプライ一覧と、A の通知から B の分が消える。第三者と B 本人には見える。ミュート解除で A にも出る。
- 書き込み側・API レスポンス（`threadBroken` 等）にミュート由来の差を一切出さない。

## 通知（type `reply`）
- 作成: [`createReplyNotification`](../src/lib/notifications/replyNotifications.ts)。publishImage の保存確定後の `afterSaved` から呼ぶ。例外は握る（保存・連合後に例外を返すと再送・リトライで二重投稿になるため）。
- 自分の投稿へのリプライ（セルフスレッド・「連」）は通知しない。1リプライ1通知・id は決定的 `reply-<replyImageId>`（冪等）。
- `Notification.imageId` は**リプライ側の画像**。data は持たず、送信者・削除・取り下げ・ミュートはリレーションから読み取り時に導出する（[`isReplyNotificationVisible`](../src/lib/notifications/muteFilter.ts)）。リプライ画像の削除・取り下げ、親の削除、送信者のミュートのいずれかで痕跡なく消える。
- 文言は [replyNotificationType.ts](../src/lib/notifications/replyNotificationType.ts) 1か所（ベルと通知一覧で二重に書かない）。
