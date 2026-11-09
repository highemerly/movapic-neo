# 機能詳細（認証／カレンダー／日付の区切り／実績／PWA）

## Fediverse認証
- 対応: Mastodon（OAuth 2.0）/ Misskey（MiAuth）。インスタンス検出はnodeinfoで自動判定。セッションはJWT（7日・httpOnly Cookie）。
- **API**: `POST /api/auth/fediverse/register`（サーバー名から種別判定し認可URL返却）/ `GET .../callback/mastodon` / `GET .../callback/misskey` / `POST /api/auth/logout`。
- **フロー**: サーバー名入力 → register（Mastodonは動的クライアント登録、Misskeyは MiAuthセッション生成）→ 認可画面 → コールバックでトークン取得 → ユーザー作成/更新 → JWT発行。
- **サーバーポリシー**（env 読み取りは [serverPolicy.ts](../src/lib/auth/serverPolicy.ts) に集約・すべて任意）:
  - `LOGIN_PLATFORM`: ログイン可能なプラットフォーム（カンマ区切り: mastodon/misskey）。未設定=両方許可。
  - `ALLOWED_SERVERS`: 許可サーバー（カンマ区切り）。未設定=全許可。
  - `DENIED_SERVERS`: 拒否サーバー（カンマ区切り）。ログイン開始のみ弾き、既存アカウント・セッションには影響しない。将来 admin GUI からの追加（DB とのマージ）を予定しており、`getDeniedServers()` が差し替えの単一チョークポイント。
  - `HOME_SERVER`: ホームインスタンス（**単一値**）。所属ユーザーのプロフィールURLが素の `username` になる（他は `username@domain`）。未設定なら短縮なし・素の `/u/username` は 404。クライアント側のリンク生成へは root layout から [HomeServerProvider](../src/components/HomeServerProvider.tsx)（React Context）で配る。
  - `FAVOR_SERVERS`: 特典サーバー（カンマ区切り）。特典は皆勤賞の穴埋め枠: 2026-09 以前の月は未投稿許容日数が 4 日（他は 3 日。[grace.ts](../src/lib/achievements/grace.ts)）、2026-10 以降は穴埋めポイントを毎月+1pt（[monthlyGrants.ts](../src/lib/makeup/monthlyGrants.ts)）。判定は `isFavorServer()`。

## カレンダー機能
- 月別カレンダー表示（投稿日にサムネイル）。日付クリックでその日の代表画像の詳細ページへ。**皆勤賞**: その月毎日投稿で👑。
- **穴埋め**: 忘れた日を、同月の後日のダブル投稿で埋める。2026-10 分からは**穴埋めポイント制**（1pt=1日・月ごと・持ち越し不可・翌月10日締切・全ユーザー手動）。上限の解決・付与・通知・締切・不変条件は [achievements/README](../src/lib/achievements/README.md) の「特殊: 皆勤賞」を正とする。本人にはカレンダーに残りポイントと付与履歴を出す。
  - **月間投稿日数**: その月に10日・20日投稿で実績（銀・穴埋めは数えない）。皆勤賞が不可能になった月は、本人向けのカレンダー上部の案内と実績タブの「次のステップ」をこの目標に切り替える（[monthDays.ts](../src/lib/achievements/monthDays.ts)）。
  - 2026-09 以前の月の旧ルール（固定上限・自動穴埋め `User.autoMakeup`）は撤去済み。過去月の👑判定と表示のために固定上限（`perfectMonthGrace`）と割当（`makeupTargetDay`）だけ残る。
- **月次画像（コラージュ）**: 本人がカレンダーの「月次画像を作成」から、その月の写真を1枚にまとめた画像を作って共有できる（[CollageShareDialog](../src/components/calendar/CollageShareDialog.tsx)）。月初には先月に投稿した人へ `monthly-collage` 通知を送り、`?collage=1` 付きのカレンダー（ダイアログを開いた状態・本人のみ）へ誘導する。クエリは開いた直後に URL から外す（リロード・戻るで開き直さない）。
- **サムネイル**: 128x128px WebP・quality 80。投稿時（`/api/v1/post`内）に生成。クロップ位置は文字位置に応じた角基準（top/left→左上、bottom→左下、right→右上）。既存画像は `npx tsx scripts/generate-thumbnails.ts`。

## 日付の区切り
1日の始まりを、ユーザーごとに 0〜4 時から選べる（設定の「高度な設定」→「1日の区切り」。2 時区切りなら 2:00〜翌1:59 が1日）。夜型の人が 0 時を過ぎてから投稿しても、前の日の分にできるようにするため。新規ユーザーは 0 時区切り（従来どおり）。

- **記録日**: 投稿が数えられる日。保存時に持ち主の区切りで決め、`Image.postDate` に確定する（**以後書き換えない**）。日・月を数える処理はすべてこれを読み、`createdAt` から計算し直さない。区切りの変更やロジックのバグで、過去の記録日・👑・穴埋めの割当・ポイントの月が動かないようにするため。既存の投稿は `created_at` の JST 日付で埋めた（全員 0 時区切りだったので従来と完全に一致）。計算は [dayClock.ts](../src/lib/dayClock.ts)、DB の読み書きは [dayClock.server.ts](../src/lib/dayClock.server.ts)。
- **履歴**: `DayBoundarySetting(userId, fromDate, hour)`＝「この記録日から何時区切り」。行が無い日は 0 時。hour は DB の CHECK で 0〜4（記録日が「JST の日付かその前日」になり、時刻に対して単調になる前提を守る。5 時以上にすると早起き（5〜7 時台・時計どおり）の投稿が前の日になる）。
- **変更は翌日から（まれに翌々日から）**: 区切りを h に変えると、`max(記録日(今+10分, 今の履歴), 記録日(今+10分, 全日 h)) + 1日` から効く（[`planBoundaryChange`](../src/lib/dayClock.ts)）。動かすのは「今＋10分より後の境界」だけなので、保存済みの投稿の記録日と今日は変わらない。
  - 例: 2 時区切りの人が 11/9 1:00（まだ 11/8）に 0 時区切りへ変えると、11/9 0:00 の境界はもう過ぎているので 11/10 から（11/9 は 2:00〜24:00 の22時間）。切り替えた日の長さは 20〜28 時間になる。
  - **抜け道を塞ぐ**: 0 時区切りの人が昨日の投稿を忘れ、1:00 に 4 時区切りへ変えて昨日の分にする、はできない（効くのは明後日から）。
  - 10 分の余白は、投稿処理が履歴を読んでから保存するまでの間に境界が動いて、記録日が今日より先の日になるのを防ぐため。
  - 予約の上書き・取り消しも同じ式で扱う。そのため、今日より後の行は最大2つになりうる（11/8 に 0→4 時を予約し、11/9 2:00（まだ 11/8）に取り消すと「11/9 は 4 時区切り・11/10 から 0 時区切り」）。設定画面とトーストは必ず日付つきで出す（今日から効いたように見せない）。
  - 変更は「読む→計算→書く」をユーザー単位の advisory lock で直列化する。
  - **遡っての変更は受け付けない**（問い合わせがあっても同じ）。過去の日の長さが変わると、確定した👑・割当・ポイントと食い違うため。管理画面のアカウント一覧で今の区切りと履歴を確認できる。
- **何が記録日に従うか**

  | 記録日（持ち主の区切り） | 時計どおり（JST） |
  |---|---|
  | カレンダーのセル・代表サムネ・今日・今月/未来月・前月/翌月（閲覧者が見る場合も持ち主の区切り） | 投稿時刻の表示 |
  | 皆勤賞・穴埋め（穴・donor・1日1donor・月またぎ・締切） | 書き初め・早起き・夜更かし・全時間帯 |
  | 連続投稿・1日にN枚・ハットトリック・月刊SHAMEZO・投稿した月数・月間投稿日数 | シーズン・イベントの開始/終了時刻 |
  | おかえり通知の日数・穴埋めを促す通知の「今日」と1日1通 | 管理画面の時系列・投稿のレート制限 |
  | /stats の「1日の最多投稿数」「連続投稿（最長）」 | 登録時のポイント（登録時はまだ区切りを設定できないので JST と同じ） |
  | 実績ptの付与先の月（その人の今月） | 月次の一括処理のゲート（下記） |

- **表示**: カレンダーのすぐ下に、持ち主の今の区切り（「1日の区切り: 2時（2:00〜翌1:59）」）を閲覧者全員に出す。区切りを変えた人の深夜の投稿が前の日に入っている理由が、見る人にも分かるようにするため。本人には設定への「変更」リンクも出す。予約中の変更（明日以降の区切り）は本人の設定画面にだけ出す。
- **締切**: 穴埋めは対象月の翌月10日まで（持ち主の記録日で判定）。2 時区切りなら 11日 1:59 まで。判定は記録日の比較で行い、表示用の締切時刻と今の時刻を比べない（後から予約された変更で表示用の時刻は動きうる）。
- **月次の一括処理**（favor-monthly・catchup・イベント・月次画像の通知）は、全員共通の「いちばん遅い時計」（4 時区切り）で動かす。誰の X 日も X 4:00 までには始まっているので、1日・11日の 4:00 JST 以降なら全員が新しい月に入り、締切も過ぎている。catchup を締切より前に配ると、区切りの遅い人が +1pt を受け取ってから先月を埋めて👑も取れてしまう。ポイントの付与は全員が同じ月にいる間（1日 4:00〜月末 24:00）だけ（区切りの遅い人の終わった月に配らない＝月末で凍結）。
- **回帰防止**: 日を扱うコードから JST の日付ヘルパー（`toJstDateString` / `toJstYm` 等）の import を ESLint で禁止し（[eslint.config.mjs](../eslint.config.mjs)）、生 SQL の `AT TIME ZONE` が `src/lib/admin` の外に出てこないことをテストで確かめる（[dayClock.test.ts](../src/lib/dayClock.test.ts)）。

## 実績・通知機能
- ユーザーページの「実績」タブ（誰でも閲覧可）＋ヘッダーのベル通知（ログインユーザーのみ）。
- 付与は原則「投稿した瞬間」に確定する条件のみ。web/email/mention が収束する `publishImage.ts` に1箇所フック。
- 例外はリアクション起点の実績（`trigger: "reaction"`）。投稿と無関係に増減するため、**リアクションの書き込み（PUT）と `Image.favoriteCount` を更新した瞬間**だけで評価する（[reactionTriggers.ts](../src/lib/achievements/reactionTriggers.ts)）。
- **追加・変更の手順と不変条件は [`src/lib/achievements/README.md`](../src/lib/achievements/README.md) に集約**（keyは永続でリネーム禁止、しきい値は `>=`、live と backfill の集計を必ず同期 等）。
- 既存ユーザーへの反映: `DATABASE_URL=... npx tsx scripts/backfill-achievements.ts`（冪等）。
- 通知の種別（`Notification.type`）: `achievement` / `favorite` / `makeup-*` / `reply`（スレッドに投稿された。[リプライ仕様](./reply.md)）/ `welcome-back`（下記「おかえり」）/ `monthly-collage`（月初に先月の月次画像を作れると知らせる。[定期ジョブ](./periodic-jobs.md)）。表示文言は種別ごとに1モジュールへ集約し、ベル（[NotificationBell](../src/components/layout/NotificationBell.tsx)）と通知一覧（[NotificationsList](../src/components/notifications/NotificationsList.tsx)）は共通の [NotificationBody](../src/components/notifications/NotificationBody.tsx) で本文を組む（二重に書かない）。本文は2行で、1行目は「絵文字＋要点」（例: `🎉❤❤＋2`・`🏆実績名`・`🖼️10月のまとめ`）、2行目はベルでは短い体言止め・通知一覧では文章（詳細は（）に入れて「。」で終える）。リアクション・スレッドは2行目の先頭に相手のアイコンを置き「👤👤 さんからリアクションを受信」のように主語にする（絵文字・アイコンだけに削ったら何の通知か分からなくなったため、2行目で必ず言葉にする）。形は [lines.ts](../src/lib/notifications/lines.ts)。ミュート相手の通知と、写真が削除されたリアクション・スレッド通知は読み取り時（[getRecentNotifications](../src/lib/achievements/notifications.ts)）に落とす（実績通知は写真が消えても実績が残るので出す）。

### おかえり（しばらく空いた後の投稿）
- 前回の投稿から **記録日で30日以上** 空いた投稿で、本人に `welcome-back` 通知を作る（何日ぶりか・その投稿の写真付き）。習慣が途切れた人が戻ってきたとき、途切れた事実ではなく戻ってきたことを肯定するため。
- **実績にはしない**（一度きりの付与では2回目以降の復帰を迎えられない）。復帰のたびに1通。
- 作成は `publishImage` の `afterSaved`（[welcomeBackNotifications.ts](../src/lib/notifications/welcomeBackNotifications.ts)）＝web・メール・Bot の全経路。再投稿は通らない。通知 id は `welcome-back-<imageId>` で決定的（二重に作らない）。
- Web 投稿直後の画像詳細（`?posted=1`・本人のみ）では、**その通知があるときだけ**トーストを出す（投稿完了のトーストの後に出して手前に重ねる）。判定は投稿時の1回だけで、表示側で前回の投稿を引き直さない。モーダルにしないのは、投稿直後の割り込み（実績のお祝い・PWA のおすすめ）は1つまでという排他と競合させないため。pitfall: 最初は画像の上のバナーにしたが、投稿完了のトーストに隠れて読めなかった。
- 通知は1行目「👋おかえりなさい！」・2行目「◯日ぶりの投稿です。」（通知一覧は「戻ってきてくれてうれしいです！」まで）。投稿直後のトーストは「おかえりなさい！◯日ぶりの投稿です。戻ってきてくれてうれしいです！」の1文だけ（2行にすると投稿完了のトーストと重なって読みにくいため）。判定・文言は [welcomeBackNotificationType.ts](../src/lib/notifications/welcomeBackNotificationType.ts) が単一ソース。

## PWA対応
ホーム画面追加対応のPWA。Push通知は**やらない**。
- **インストール**: 静的 [manifest.json](../public/manifest.json)（`display: standalone`）。アイコンは `npx tsx scripts/generate-pwa-icons.ts` で生成（`public/icons/`、any/maskable/apple-touch）。metadata（manifest/appleWebApp/viewport）は [layout.tsx](../src/app/layout.tsx)。
- **投稿完了後のおすすめモーダル**: Web投稿の遷移先（画像詳細 `?posted=1`）で、ブラウザ利用中のユーザーにホーム画面追加を提案する（[InstallSuggestModal](../src/components/pwa/InstallSuggestModal.tsx)）。
  - 出す条件: 投稿者本人＋**2投稿目以降**（初投稿では出さない。サーバー側で「この画像以外の投稿があるか」を `findFirst` で存在確認）／standalone でない／Android は `beforeinstallprompt` 捕捉済み・iOS は Safari のみ（デスクトップ・iOS非Safariは対象外＝既存方針）。
  - **実績を獲得した投稿では出さない**。[AchievementCelebration](../src/app/u/%5Busername%5D/status/%5BimageId%5D/AchievementCelebration.tsx) の `fallback` として描画し、投稿直後の割り込みは常に1つまでという排他を構造で保証する。
  - 頻度制御は [suggest.ts](../src/lib/pwa/suggest.ts)（localStorage `shamezo:pwa-suggest`＝キーは [storageKeys.ts](../src/lib/storageKeys.ts) で一元管理）。断られた回数で 30日 → 90日 → 打ち止め。背景タップ/Esc/「いいえ、結構です」/OSダイアログのキャンセルはすべて「断られた」扱い。承諾時は以後 standalone 判定で自然に対象外になるので猶予は記録しない。閉じずに離脱すると猶予が残らないため、同一セッション中の再表示はモジュール変数で抑止する。
  - 完了トーストと重ならないよう 1.2 秒遅らせて表示。iOS は手順（[IosInstallSteps](../src/components/pwa/IosInstallSteps.tsx)・`/settings/install` と共用）をモーダル内に出し、遷移させない。
- **Share Target（簡単投稿）**: 他アプリ共有メニュー → manifest `share_target`（`POST /share-target`）→ 最小SW [sw.js](../public/sw.js) が画像をCache Storageへ保存し `/create?shared=1` へ303 → [CreateClient.tsx](../src/app/create/CreateClient.tsx) がマウント時に取り出し `handleImageSelect` へ。SWはこの用途のみ（オフラインキャッシュなし。登録は [ServiceWorkerRegister.tsx](../src/components/ServiceWorkerRegister.tsx)）。**iOS Safari の PWA では共有受信不可**（仕様上。インストール・下部メニューは動作）。
- **下部メニューバー（standalone時のみ）**: [BottomNav.tsx](../src/components/layout/BottomNav.tsx)。みんな/同じサーバー/投稿(中央強調)/マイページ/メニュー。未ログイン時はログイン必須項目を非表示。表示情報はDBレスな `getSessionClaims()` から layout で取得。
- **standalone判定はCSSのみ**（JS不使用でハイドレーション不整合を回避）: [globals.css](../src/app/globals.css) の `@custom-variant standalone`。BottomNavは `standalone:md:flex`、[SiteHeader](../src/components/layout/SiteHeader.tsx) は `standalone:md:static`（PC非standaloneのみ sticky）。
- layout で cookie を読むため全ページが動的レンダリング（認証中心アプリのため許容）。
