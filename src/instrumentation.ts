export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const sharp = (await import("sharp")).default;
    sharp.cache(false);

    // worker pod でのみ Graphile Worker ランナーを起動する。
    // web pod では RUN_WORKER 未設定 → ランナーは起動せず enqueue のみ可能。
    if (process.env.RUN_WORKER === "true") {
      try {
        const { runWorker } = await import("@/lib/queue");
        await runWorker();
      } catch (err) {
        // worker 起動失敗で HTTP 配信まで落とさない
        console.error("[instrumentation] failed to start worker:", err);
      }
    }
  }
}
