# 定期ジョブ

30分ごとの定期メンテナンス。**graphile-worker の crontab で worker-front 常駐ランナー自身が `periodic` タスクを enqueue** する（k8s CronJob・curl Pod・cloudflare 経由の HTTP 往復は無し＝完全にプロセス内部へ閉じている）。worker-front は必ず1Pod のため発火重複なし。

- 単一ディスパッチャ `periodic`（[tasks.ts](../src/lib/queue/tasks.ts)）が複数サブジョブを順に回す。実体は [src/lib/periodic/index.ts](../src/lib/periodic/index.ts) の `runPeriodicJobs()`。各サブジョブは try/catch で隔離（1つ失敗しても他は続行）。crontab 文字列は [src/lib/queue/index.ts](../src/lib/queue/index.ts) の `CRONTAB`。

## 現状のサブジョブ
- `mention-poll`: メンション取りこぼし回収（since_id ポーリング→`process-mention` を enqueue。dedup は jobKey=mention:statusId）。
- `tmp-cleanup`: オブジェクトストレージ `tmp/` の一時ファイルを30分経過で削除。メール投稿の元画像は producer が `tmp/email/{uuid}` に保存し worker が成功時のみ削除するため、投稿失敗（リトライ上限超過等）で残留する分を回収する。実装は `listExpiredObjects`（[storage.ts](../src/lib/storage/storage.ts)・LastModified判定）＋ `deleteImage`。出力画像/サムネは `{year}/{month}/{day}/` プレフィックスなので混在しない。
- `favorite-sync`: リアクションのフォールバック同期。画像詳細ページが一度も開かれない投稿は閲覧時（GET）の同期に乗らないため、ここで拾う。オーナー側で取り消されたリアクションの反映（`reconcileRemovals`）も兼ねる。発火条件・バックオフ・停止条件は入り組んでいるので [リアクション仕様](./favorite.md) を正とする。
- `mute-cleanup`: 期限切れミュート行の削除（`expiresAt=null` の無期は残す）。表示・除外は期限切れ行が残っていても正しく動くので、肥大防止のための掃除。

## graphile-worker のスキーマ更新
`graphile_worker` スキーマを作る・更新するのは **`run()` を呼ぶ worker-front だけ**。producer（web）が使う `makeWorkerUtils` は migrate せず、既存スキーマへ `add_job` するだけなので、producer 側のバージョンがずれていても enqueue は通る。

メジャー更新には破壊的マイグレーションが入りうる（0.16→0.17 の `000019`）。適用後は旧バージョンが `Database is using Graphile Worker schema revision ... It would be unsafe to continue` で**起動を拒否する**ため、取り残しは無言では壊れず必ず表面化する。

worker-front の Deployment は既定の RollingUpdate だと `replicas: 1` でも新Podが先に立ち上がって一瞬2重になるが、**通常のローリングアップデートで進めてよい**。新旧ランナーが重なっても壊れないことは 0.16→0.17 で確認済み:

- ロック回収は時間ベース（`locked_at < now() - interval '4 hours'`）のみで、「相手のプールが死んでいそうだから奪う」経路が無い＝数十秒の重なりで二重実行は起きない。
- cron の発火は `_private_known_crontabs` の `last_execution` で DB 排他され、`returning` で行を受け取ったプールだけが enqueue する＝Podが2つでも `periodic` は二重に積まれない。
- SIGTERM は graphile-worker 自身が拾って `gracefulShutdown` する＝旧Podの処理中ジョブは解放され新Podがリトライする。
- producer は migrate もバージョンチェックもしないので、web 側が旧バージョンのままでも enqueue は通り続ける。

ただしこれは**スキーマ自体が変わらなかった場合の結論**。次のメジャー更新では移行SQLの中身（`node_modules/graphile-worker/sql/` の新規ファイル）を必ず読み、実体のある DDL が入るなら worker-front を 0 に落としてからデプロイする。

## 追加予定（未実装）
定期判定でのみ付与できる実績。`periodicJobs` 配列に1要素足すだけ。
