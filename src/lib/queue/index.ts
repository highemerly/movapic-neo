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
  TASK_PERIODIC,
  type ProcessMentionPayload,
  type ProcessEmailPayload,
  type NotifyReportPayload,
  type DeleteAccountPayload,
} from "./tasks";

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

/**
 * worker ランナーを起動する。COMPONENT_ROLE=worker-front の pod でのみ呼ばれる。
 * 重い画像処理は compute へ委譲するが、bot/email ジョブの compute への同時負荷を
 * 律速するため concurrency は控えめ（既定 3）。
 */
export async function runWorker(): Promise<void> {
  if (runner) return;

  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "3", 10);

  runner = await run({
    connectionString: getConnectionString(),
    concurrency,
    // LISTEN/NOTIFY で即時起床。取りこぼし対策に短いポーリングも併用される。
    pollInterval: 2000,
    taskList,
    // 定期ジョブのスケジューラ（30分ごとに periodic タスクを enqueue）。
    crontab: CRONTAB,
  });

  console.log(
    `[worker] Graphile Worker started (concurrency=${concurrency}, crontab="${CRONTAB}")`
  );

  runner.promise.catch((err) => {
    console.error("[worker] runner crashed:", err);
  });
}
