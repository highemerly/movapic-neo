/**
 * プロセス起動時フック。COMPONENT_ROLE で役割を確定させる。
 *
 * - compute / 未設定(dev): sharp を読み込みキャッシュ無効化（画像処理を行うのはこの役割のみ）
 * - worker-front / 未設定(dev): Graphile Worker ランナーを起動（キュー consumer）
 * - web: いずれも行わない（producer / ページ配信のみ）
 *
 * 未設定はローカル all-in-one（全部入り）として振る舞う。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const role = process.env.COMPONENT_ROLE;
  const isCompute = role === "compute";
  const isWorkerFront = role === "worker-front";
  const isAllInOne = role === undefined || role === "";

  // 画像処理を行う役割でのみ sharp を読み込む（worker-front/web では native を載せない）
  if (isCompute || isAllInOne) {
    const sharp = (await import("sharp")).default;
    sharp.cache(false);
  }

  // キュー consumer は worker-front（と dev all-in-one）でのみ起動
  if (isWorkerFront || isAllInOne) {
    try {
      const { runWorker } = await import("@/lib/queue");
      await runWorker();
    } catch (err) {
      // worker 起動失敗で HTTP 配信まで落とさない
      console.error("[instrumentation] failed to start worker:", err);
    }

    // Mastodon メンションの streaming 受信（低レイテンシ主経路。cron は安全網として併存）
    try {
      const { startMentionStream } = await import("@/lib/mention/streamer");
      startMentionStream();
    } catch (err) {
      // streaming 起動失敗でも cron ポーリングで取り込みは継続する
      console.error("[instrumentation] failed to start mention stream:", err);
    }
  }

  console.log(`[instrumentation] COMPONENT_ROLE=${role || "(all-in-one)"}`);
}
