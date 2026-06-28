/**
 * 定期メンテナンスジョブ。
 *
 * graphile-worker の crontab（30分ごと）で enqueue される単一タスク `periodic` の実体。
 * worker-front の常駐ランナー自身が発火・実行する（k8s CronJob や curl Pod、
 * cloudflare 経由の HTTP 往復は不要。完全にプロセス内部へ閉じている）。
 *
 * 複数のサブジョブを順に回す。各ジョブは独立して try/catch するため、
 * 1つが失敗しても他のジョブは続行する。新しい定期処理は periodicJobs に1要素足すだけ。
 */

import { pollAndEnqueueMentions } from "@/lib/mention/ingest";
import { listExpiredObjects, deleteImage } from "@/lib/storage/storage";

interface PeriodicJob {
  /** ログ識別用の名前 */
  name: string;
  run: () => Promise<void>;
}

/** tmp/* 一時ファイルを残留とみなすしきい値（30分） */
const TMP_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Bot メンションの取りこぼし回収。
 * 主経路は streaming（worker-front 常駐 WebSocket）。これはその安全網で、
 * since_id ポーリングして再接続ギャップ等の取りこぼしを埋める。
 * dedup は jobKey=mention:statusId で担保されるため streaming と併用しても安全。
 */
const mentionPoll: PeriodicJob = {
  name: "mention-poll",
  run: async () => {
    const instanceUrl =
      process.env.MASTODON_BOT_INSTANCE_URL || "https://handon.club";
    const accessToken = process.env.MASTODON_BOT_ACCESS_TOKEN || "";
    if (!accessToken) {
      console.warn(
        "[periodic] mention-poll skipped: MASTODON_BOT_ACCESS_TOKEN 未設定"
      );
      return;
    }
    const { enqueued, failed, cleaned } = await pollAndEnqueueMentions(
      instanceUrl,
      accessToken,
      10
    );
    if (enqueued || failed || cleaned) {
      console.log(
        `[periodic] mention-poll: enqueued=${enqueued} failed=${failed} cleaned=${cleaned}`
      );
    }
  },
};

/**
 * オブジェクトストレージの tmp/ 一時領域のクリーンアップ。
 *
 * メール投稿の元画像は producer が `tmp/email/{uuid}.{ext}` に同期保存し、worker は
 * 投稿成功時のみ削除する。リトライ上限（maxAttempts=3）超過などで投稿が失敗すると
 * 削除されず永久に残留するため、30分以上経過した tmp/ オブジェクトを定期削除する。
 *
 * リトライは通常数分で収束するため、処理中ファイルの誤削除は起きない。worker が
 * 30分以上停止していた場合のみ未処理ファイルを取りこぼし得るが、それはワーカー障害
 * そのものの問題で、その間はメール投稿も成立していない（許容する割り切り）。
 * 出力画像・サムネは `{year}/{month}/{day}/` プレフィックスなので tmp/ とは混在しない。
 */
const tmpCleanup: PeriodicJob = {
  name: "tmp-cleanup",
  run: async () => {
    const keys = await listExpiredObjects("tmp/", TMP_MAX_AGE_MS);
    let deleted = 0;
    for (const key of keys) {
      try {
        await deleteImage(key);
        deleted++;
      } catch (err) {
        console.error(`[periodic] tmp-cleanup: delete failed ${key}:`, err);
      }
    }
    if (deleted > 0) {
      console.log(
        `[periodic] tmp-cleanup: deleted ${deleted}/${keys.length} expired tmp objects`
      );
    }
  },
};

/**
 * 実行する定期ジョブ一覧。先頭から順に実行される。
 *
 * 今後ここに足す予定（実装は別途）:
 *   - お気に入り情報を一度も取得しておらず、かつ投稿後2時間が経過した投稿の取得
 *   - 定期判定でしか付与できない実績の判定
 */
const periodicJobs: PeriodicJob[] = [mentionPoll, tmpCleanup];

/** 全ての定期ジョブを順に実行する。各ジョブの失敗は隔離され、他のジョブには波及しない。 */
export async function runPeriodicJobs(): Promise<void> {
  for (const job of periodicJobs) {
    const start = Date.now();
    try {
      await job.run();
    } catch (err) {
      console.error(`[periodic] ${job.name} failed:`, err);
    } finally {
      const ms = Date.now() - start;
      if (ms > 1000) {
        console.log(`[periodic] ${job.name} took ${ms}ms`);
      }
    }
  }
}
