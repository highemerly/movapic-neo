# 定期ジョブ

30分ごとの定期メンテナンス。**graphile-worker の crontab で worker-front 常駐ランナー自身が `periodic` タスクを enqueue** する（k8s CronJob・curl Pod・cloudflare 経由の HTTP 往復は無し＝完全にプロセス内部へ閉じている）。worker-front は必ず1Pod のため発火重複なし。

- 単一ディスパッチャ `periodic`（[tasks.ts](../src/lib/queue/tasks.ts)）が複数サブジョブを順に回す。実体は [src/lib/periodic/index.ts](../src/lib/periodic/index.ts) の `runPeriodicJobs()`。各サブジョブは try/catch で隔離（1つ失敗しても他は続行）。crontab 文字列は [src/lib/queue/index.ts](../src/lib/queue/index.ts) の `CRONTAB`。

## 現状のサブジョブ
- `mention-poll`: メンション取りこぼし回収（since_id ポーリング→`process-mention` を enqueue。dedup は jobKey=mention:statusId）。
- `tmp-cleanup`: オブジェクトストレージ `tmp/` の一時ファイルを30分経過で削除。メール投稿の元画像は producer が `tmp/email/{uuid}` に保存し worker が成功時のみ削除するため、投稿失敗（リトライ上限超過等）で残留する分を回収する。実装は `listExpiredObjects`（[storage.ts](../src/lib/storage/storage.ts)・LastModified判定）＋ `deleteImage`。出力画像/サムネは `{year}/{month}/{day}/` プレフィックスなので混在しない。

## 追加予定（未実装）
お気に入り未取得かつ投稿後2時間経過分の取得 ／ 定期判定でのみ付与できる実績。`periodicJobs` 配列に1要素足すだけ。
