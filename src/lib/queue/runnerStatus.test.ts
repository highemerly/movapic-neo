import { describe, it, expect, beforeEach } from "vitest";
import {
  workerRunnerStatus,
  getWorkerRunnerStatus,
  pickWorkerRunner,
} from "./runnerStatus";

describe("workerRunnerStatus", () => {
  beforeEach(() => {
    // globalThis に状態を持つため、テスト間で初期化する
    delete (globalThis as { __workerRunnerStatus?: unknown }).__workerRunnerStatus;
  });

  it("初期状態は starting で未起動を表す", () => {
    const s = workerRunnerStatus();
    expect(s.state).toBe("starting");
    expect(s.runningSince).toBeNull();
    expect(s.lastError).toBeNull();
    expect(s.restarts).toBe(0);
  });

  it("同一プロセス内では同じ可変状態を共有する", () => {
    workerRunnerStatus().state = "running";
    expect(workerRunnerStatus().state).toBe("running");
  });

  it("getWorkerRunnerStatus はスナップショット（内部を書き換えても影響しない）を返す", () => {
    const snap = getWorkerRunnerStatus();
    snap.state = "crashed";
    expect(workerRunnerStatus().state).toBe("starting");
  });
});

describe("pickWorkerRunner", () => {
  it("body.runner から状態を取り出す", () => {
    const runner = pickWorkerRunner({
      runner: {
        state: "running",
        runningSince: 1000,
        lastError: null,
        restarts: 2,
      },
    });
    expect(runner).toEqual({
      state: "running",
      runningSince: 1000,
      lastError: null,
      restarts: 2,
    });
  });

  it("欠損フィールドは既定値で補う", () => {
    const runner = pickWorkerRunner({ runner: { state: "failed-to-start" } });
    expect(runner).toEqual({
      state: "failed-to-start",
      runningSince: null,
      lastError: null,
      restarts: 0,
    });
  });

  it.each([
    ["null", null],
    ["runner なし", { ok: true }],
    ["runner が null（非worker役割）", { runner: null }],
    ["state が無い", { runner: { restarts: 1 } }],
  ])("%s の場合は null を返す", (_label, body) => {
    expect(pickWorkerRunner(body)).toBeNull();
  });
});
