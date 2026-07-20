/**
 * Graphile Worker ランナー（キュー consumer）の生存状態。
 *
 * ランナー本体（index.ts＝graphile-worker を読む）とヘルスエンドポイント（route）で
 * 共有するが、route/web 側に graphile-worker を載せないため状態だけをこの軽量モジュールに
 * 分離する（bot streaming の streamer.ts / streamStatus.ts と同じ分離方針）。
 *
 * 状態は instrumentation（書き手）とルートハンドラ（読み手）でバンドルが分かれても
 * 同一プロセス内で共有できるよう globalThis に置く。
 */

/** starting=起動試行中 / running=稼働中 / crashed=起動後クラッシュ / failed-to-start=初回起動失敗 */
export type WorkerRunnerState =
  | "starting"
  | "running"
  | "crashed"
  | "failed-to-start";

export interface WorkerRunnerStatus {
  state: WorkerRunnerState;
  /** run() が最後に成功した時刻（epoch ms）。一度も起動できていなければ null */
  runningSince: number | null;
  /** 直近の起動失敗/クラッシュのメッセージ（正常時は null） */
  lastError: string | null;
  /** 起動失敗/クラッシュで再起動した累積回数 */
  restarts: number;
}

const globalStore = globalThis as unknown as {
  __workerRunnerStatus?: WorkerRunnerStatus;
};

/** プロセス内の可変状態を返す（書き込み用。ランナー監督ループが更新する）。 */
export function workerRunnerStatus(): WorkerRunnerStatus {
  if (!globalStore.__workerRunnerStatus) {
    globalStore.__workerRunnerStatus = {
      state: "starting",
      runningSince: null,
      lastError: null,
      restarts: 0,
    };
  }
  return globalStore.__workerRunnerStatus;
}

/** 状態のスナップショット（読み取り用。ヘルスチェックが使う）。 */
export function getWorkerRunnerStatus(): WorkerRunnerStatus {
  return { ...workerRunnerStatus() };
}

/** /api/health/stream レスポンス body の runner 部分を取り出す。無ければ null。 */
export function pickWorkerRunner(body: unknown): WorkerRunnerStatus | null {
  if (!body || typeof body !== "object") return null;
  const r = (body as { runner?: unknown }).runner;
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.state !== "string") return null;
  return {
    state: o.state as WorkerRunnerState,
    runningSince: (o.runningSince as number | null) ?? null,
    lastError: (o.lastError as string | null) ?? null,
    restarts: Number(o.restarts ?? 0),
  };
}
