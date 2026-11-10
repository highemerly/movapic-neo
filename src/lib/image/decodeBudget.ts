/**
 * compute Pod 内の、画像デコード用メモリ予算（加重セマフォ）。
 *
 * decodeLimits の画素数上限は「1枚」の天井で、同時に来た分の合計は守れない。compute は
 * 未認証の /api/v1/generate から叩けるため、各リクエストの見積もり（estimateDecodeMB）を足して
 * 予算を超える分は到着順に待たせる。通常の写真（12MP で 200MB 前後）は並列のまま通る。
 * pitfall: 予算なしでは 79MP の AVIF（2KB）2枚の同時送信で OOM Kill された（2026-11-10 再現）。
 *
 * - 何も処理していなければ、予算を超える見積もりでも1件は通す（1枚の天井は decodeLimits が守る）。
 * - 先頭が待っている間は後続の小さいものも追い越させない（大きい画像が永遠に待たされないように）。
 * - 待っている間に呼び出し元が諦めたら（worker-front の 18 秒タイムアウトや切断で request.signal が
 *   abort）、列から外す。諦められた処理を後から実行しないため。
 */

export type ReleaseBudget = () => void;

interface Waiter {
  costMB: number;
  resolve: (release: ReleaseBudget) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export interface MemoryBudget {
  acquire(costMB: number, signal?: AbortSignal): Promise<ReleaseBudget>;
  /** 使用中の見積もり合計（MB）。ログ用 */
  inUseMB(): number;
  /** 待っている件数。ログ用 */
  waiting(): number;
}

export function createMemoryBudget(totalMB: number): MemoryBudget {
  let inUse = 0;
  const queue: Waiter[] = [];

  function makeRelease(costMB: number): ReleaseBudget {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      inUse -= costMB;
      admit();
    };
  }

  function admit(): void {
    while (queue.length > 0) {
      const head = queue[0];
      if (inUse > 0 && inUse + head.costMB > totalMB) return;
      queue.shift();
      if (head.onAbort) head.signal?.removeEventListener("abort", head.onAbort);
      inUse += head.costMB;
      head.resolve(makeRelease(head.costMB));
    }
  }

  return {
    acquire(costMB, signal) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      return new Promise<ReleaseBudget>((resolve, reject) => {
        const waiter: Waiter = { costMB, resolve, reject, signal };
        if (signal) {
          waiter.onAbort = () => {
            const i = queue.indexOf(waiter);
            if (i === -1) return;
            queue.splice(i, 1);
            reject(signal.reason);
            // 先頭が抜けたら後ろが入れるかもしれない
            admit();
          };
          signal.addEventListener("abort", waiter.onAbort, { once: true });
        }
        queue.push(waiter);
        admit();
      });
    },
    inUseMB: () => inUse,
    waiting: () => queue.length,
  };
}

/**
 * 予算はコンテナのメモリ上限から、画素数によらない分（初回処理後の常駐 約220MB＋余裕）を引いた値。
 * 常駐は上限の大きさによらずほぼ一定なので、割合ではなく固定で引く。
 * 見積もりは実測の増分以上なので、上限 1536Mi なら予算 1152MiB を使い切ってもピークは約1370MiB。
 * 上限はハードコードせずコンテナ（cgroup）から読む: Pod の上限を変えたとき予算が古いまま残らないように。
 */
const RESERVED_MB = 384;

/** cgroup の上限ファイルの中身 → バイト数。上限なし（v2 の "max"・v1 の巨大値）は undefined */
export function parseCgroupMemoryLimit(text: string): number | undefined {
  const value = text.trim();
  if (value === "max") return undefined;
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return undefined;
  // v1 は上限なしのとき 0x7FFFFFFFFFFFF000 付近の値を返す。実在しない大きさ（1PiB 超）は上限なし扱い
  if (bytes >= 2 ** 50) return undefined;
  return bytes;
}

/** メモリ上限（バイト）→ 予算（MB）。上限なし（ローカルの all-in-one など）は予算も無し＝待たせない */
export function budgetFromMemoryLimit(limitBytes: number | undefined): number {
  if (limitBytes === undefined) return Infinity;
  return Math.max(0, Math.floor(limitBytes / 1024 / 1024) - RESERVED_MB);
}

const CGROUP_MEMORY_LIMIT_FILES = [
  "/sys/fs/cgroup/memory.max", // cgroup v2
  "/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1（どちらかはノードの設定次第）
];

async function readContainerMemoryLimit(): Promise<number | undefined> {
  const { readFile } = await import("node:fs/promises");
  for (const file of CGROUP_MEMORY_LIMIT_FILES) {
    try {
      return parseCgroupMemoryLimit(await readFile(file, "utf8"));
    } catch {
      // このノードにはこの版のファイルが無い
    }
  }
  return undefined;
}

let computeDecodeBudget: Promise<MemoryBudget> | undefined;

/** compute の予算（初回に上限を読んで作り、以後は使い回す）。読んだ値はログに残す（本番で確かめるため） */
export function getComputeDecodeBudget(): Promise<MemoryBudget> {
  computeDecodeBudget ??= readContainerMemoryLimit().then((limitBytes) => {
    const budgetMB = budgetFromMemoryLimit(limitBytes);
    console.log(
      `[decodeBudget] memoryLimit=${limitBytes === undefined ? "none" : `${Math.floor(limitBytes / 1024 / 1024)}MiB`}, budget=${budgetMB}MB`
    );
    return createMemoryBudget(budgetMB);
  });
  return computeDecodeBudget;
}
