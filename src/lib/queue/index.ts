/**
 * Graphile Worker の enqueue / runner ラッパ
 *
 * - producer（web/cron）: getWorkerUtils() 経由で enqueue するだけ
 * - worker プロセス: runWorker() で常駐ランナーを起動（instrumentation.ts から RUN_WORKER 時のみ）
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
  type ProcessMentionPayload,
  type ProcessEmailPayload,
} from "./tasks";

const MAX_ATTEMPTS = 3;

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

/** mail ジョブを enqueue。 */
export async function enqueueEmail(payload: ProcessEmailPayload): Promise<void> {
  const utils = await getWorkerUtils();
  await utils.addJob(TASK_PROCESS_EMAIL, payload, {
    maxAttempts: MAX_ATTEMPTS,
  });
}

let runner: Runner | null = null;

/**
 * worker ランナーを起動する。RUN_WORKER=true の pod でのみ呼ばれる。
 * 対話的 /api/v1/generate と同居するため、concurrency は控えめ（既定 3）。
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
  });

  console.log(`[worker] Graphile Worker started (concurrency=${concurrency})`);

  runner.promise.catch((err) => {
    console.error("[worker] runner crashed:", err);
  });
}
