/**
 * Graphile Worker の enqueue / runner ラッパ
 *
 * - producer（web/cron）: getWorkerUtils() 経由で enqueue するだけ
 * - worker-front: runWorker() で常駐ランナーを起動（instrumentation.ts が COMPONENT_ROLE=worker-front 時に呼ぶ）
 *
 * Redis 不要。キュー管理は Postgres（graphile_worker スキーマ）のみで完結する。
 * SKIP LOCKED / LISTEN-NOTIFY / リトライ / backoff / reaper は Graphile Worker が担う。
 */

import {
  makeWorkerUtils,
  run,
  type WorkerUtils,
  type Runner,
} from "graphile-worker";
import {
  taskList,
  TASK_PROCESS_MENTION,
  TASK_PROCESS_EMAIL,
  TASK_NOTIFY_REPORT,
  TASK_DELETE_ACCOUNT,
  TASK_SYNC_FAVORITE,
  TASK_PERIODIC,
  FAVORITE_SYNC_DELAYS_SEC,
  type ProcessMentionPayload,
  type ProcessEmailPayload,
  type NotifyReportPayload,
  type DeleteAccountPayload,
  type SyncFavoritePayload,
} from "./tasks";
import { workerRunnerStatus } from "./runnerStatus";

const MAX_ATTEMPTS = 3;

/**
 * 定期ジョブの crontab。worker-front の常駐ランナー自身が 30分ごとに `periodic`
 * タスクを enqueue する（k8s CronJob・curl Pod・HTTP 往復は不要）。
 * worker-front は必ず1Pod のため発火重複は起きない。
 */
const CRONTAB = `*/30 * * * * ${TASK_PERIODIC}`;

function getConnectionString(): string {
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    throw new Error("DATABASE_URL is not set");
  }
  return cs;
}

let workerUtilsPromise: Promise<WorkerUtils> | null = null;

/** enqueue 用の WorkerUtils（プロセス内シングルトン）。初回接続時に graphile_worker スキーマを migrate する。 */
function getWorkerUtils(): Promise<WorkerUtils> {
  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({
      connectionString: getConnectionString(),
    });
  }
  return workerUtilsPromise;
}

/** bot（メンション）ジョブを enqueue。statusId で dedup（同一メンションの二重投入を防ぐ）。 */
export async function enqueueMention(
  payload: ProcessMentionPayload
): Promise<void> {
  const utils = await getWorkerUtils();
  await utils.addJob(TASK_PROCESS_MENTION, payload, {
    jobKey: `mention:${payload.notification.status!.id}`,
    maxAttempts: MAX_ATTEMPTS,
  });
}

/**
 * mail ジョブを enqueue。dedupKey（raw email のハッシュ）で dedup。
 * Cloudflare Email Worker がレスポンスタイムアウト等で同一メールを再転送しても、
 * 未完了ジョブが残っていれば同一 jobKey で潰し二重投稿を防ぐ（他ジョブと同水準）。
 */
export async function enqueueEmail(
  payload: ProcessEmailPayload,
  dedupKey: string
): Promise<void> {
  const utils = await getWorkerUtils();
  await utils.addJob(TASK_PROCESS_EMAIL, payload, {
    jobKey: `email:${dedupKey}`,
    maxAttempts: MAX_ATTEMPTS,
  });
}

/** 通報の管理者通知ジョブを enqueue。reportId で dedup（同一通報の二重通知を防ぐ）。 */
export async function enqueueReportNotification(
  payload: NotifyReportPayload
): Promise<void> {
  const utils = await getWorkerUtils();
  await utils.addJob(TASK_NOTIFY_REPORT, payload, {
    jobKey: `report:${payload.reportId}`,
    maxAttempts: MAX_ATTEMPTS,
  });
}

/**
 * お気に入り操作後の遅延 sync チェーンを開始する。federation 遅延でオーナー側に viewer が
 * 載るまで数秒かかるため、最初の試行を FAVORITE_SYNC_DELAYS_SEC[0] 秒後に積む（以降は
 * タスク内で反映を確認しつつ段階的に再スケジュール・反映済みで早期終了）。
 * 同一画像への連続操作は jobKey で1本に畳む。
 */
export async function enqueueFavoriteSync(
  payload: Omit<SyncFavoritePayload, "attempt">
): Promise<void> {
  const utils = await getWorkerUtils();
  const full: SyncFavoritePayload = { ...payload, attempt: 0 };
  await utils.addJob(TASK_SYNC_FAVORITE, full, {
    runAt: new Date(Date.now() + FAVORITE_SYNC_DELAYS_SEC[0] * 1000),
    jobKey: `fav-sync:${payload.imageId}`,
    maxAttempts: MAX_ATTEMPTS,
  });
}

/** アカウント削除に伴う S3 後始末ジョブを enqueue。userId で dedup（二重投入を防ぐ）。 */
export async function enqueueDeleteAccount(
  payload: DeleteAccountPayload
): Promise<void> {
  const utils = await getWorkerUtils();
  await utils.addJob(TASK_DELETE_ACCOUNT, payload, {
    jobKey: `delete-account:${payload.userId}`,
    maxAttempts: MAX_ATTEMPTS,
  });
}

let runner: Runner | null = null;
let supervising = false;

// ランナー再起動のバックオフ。worker-front は必ず1Pod なので thundering herd 対策の
// ジッタは不要。DB 復帰待ちの間、無駄なリトライを抑えるため上限で頭打ちする。
const RUNNER_INITIAL_BACKOFF_MS = 2_000;
const RUNNER_MAX_BACKOFF_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * worker ランナーを起動し、以後の停止（初回起動失敗・起動後クラッシュ）を
 * in-process の bounded backoff で自動再起動する監督ループを開始する。
 * COMPONENT_ROLE=worker-front の pod でのみ呼ばれる。
 * 重い画像処理は compute へ委譲するが、bot/email ジョブの compute への同時負荷を
 * 律速するため concurrency は控えめ（既定 3）。
 *
 * pitfall: 以前は run() を1回呼ぶだけで、起動時に DB が一時的に届かないと
 * （instrumentation 側が例外を握りつぶすため）ランナーが永久に不在のままになり、
 * メンション/メールジョブが enqueue されても処理されず 16時間気付かれなかった。
 * そのため常駐監督＋自動再試行にする。
 *
 * k8s の再起動（CrashLoopBackOff）に委ねないのは、worker-front が同一プロセスで
 * メンション streaming と /api/health（k8s プローブ）も兼ねており、DB 一時断で
 * Pod ごと殺すと streaming 取り込みまで巻き込むため。ランナーだけを静かに復帰させる。
 */
export async function runWorker(): Promise<void> {
  // 監督ループは1本のみ（instrumentation から1回呼ばれる想定だが多重起動をガード）。
  if (supervising) return;
  supervising = true;
  // ループは常駐するため await しない（instrumentation の起動を止めない）。
  void superviseRunner();
}

async function superviseRunner(): Promise<void> {
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "3", 10);
  const st = workerRunnerStatus();
  let backoff = RUNNER_INITIAL_BACKOFF_MS;

  for (;;) {
    try {
      st.state = "starting";
      runner = await run({
        connectionString: getConnectionString(),
        concurrency,
        // LISTEN/NOTIFY で即時起床。取りこぼし対策に短いポーリングも併用される。
        pollInterval: 2000,
        taskList,
        // 定期ジョブのスケジューラ（30分ごとに periodic タスクを enqueue）。
        crontab: CRONTAB,
      });
      backoff = RUNNER_INITIAL_BACKOFF_MS; // 起動成功でバックオフをリセット
      st.state = "running";
      st.runningSince = Date.now();
      st.lastError = null;
      console.log(
        `[worker] Graphile Worker started (concurrency=${concurrency}, crontab="${CRONTAB}")`
      );
      // run() 後、ランナーが停止するまで待つ。我々は stop() しないため、
      // ここを抜ける＝クラッシュ（reject）または予期せぬ終了（resolve）＝異常。
      await runner.promise;
      st.lastError = "runner stopped unexpectedly";
    } catch (err) {
      st.lastError = err instanceof Error ? err.message : String(err);
    }

    runner = null;
    // 一度でも running になっていれば crash、そうでなければ初回起動失敗。
    st.state = st.runningSince != null ? "crashed" : "failed-to-start";
    st.restarts++;
    console.error(
      `[worker] runner is not running (${st.state}); restarting in ${backoff}ms: ${st.lastError}`
    );
    await sleep(backoff);
    backoff = Math.min(backoff * 2, RUNNER_MAX_BACKOFF_MS);
  }
}
