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

import { Prisma } from "@prisma/client";
import { pollAndEnqueueMentions } from "@/lib/mention/ingest";
import { listExpiredObjects, deleteImage } from "@/lib/storage/storage";
import prisma from "@/lib/db";
import { syncFavoriteCache } from "@/lib/fediverse/favoriteSync";
import { isFavoriteSyncDue } from "@/lib/fediverse/favoritePolicy";
import { FAVORITE_SYNC_WHERE } from "@/lib/fediverse/favoriteSyncQuery";

interface PeriodicJob {
  /** ログ識別用の名前 */
  name: string;
  /**
   * サマリ文字列を返すと runPeriodicJobs が `[periodic] {name}: {summary} ({ms}ms)` の
   * 形で1行ログに出す（実行時間も合成）。void を返した場合は何もしない（>1秒だけ took 行）。
   */
  run: () => Promise<string | void>;
}

/** tmp/* 一時ファイルを残留とみなすしきい値（30分） */
const TMP_MAX_AGE_MS = 30 * 60 * 1000;

/** お気に入りフォールバックsyncの1回あたり最大件数（初回展開時の thundering herd を防ぐ） */
const FAVORITE_SYNC_BATCH = 30;
/**
 * フォールバックsyncの同時実行数。まずは 1（逐次）で安全側に倒す。
 * 連携先インスタンスへの集中・レート制限の踏み抜きを避ける。負荷が問題化したら上げる。
 */
const FAVORITE_SYNC_CONCURRENCY = 1;
/** 各バッチ（同時実行ぶん）の間に挟むウェイト。連携先への負荷をさらに薄める */
const FAVORITE_SYNC_GAP_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Bot メンションの取りこぼし回収。
 * 主経路は streaming（worker-front 常駐 WebSocket）。これはその安全網で、
 * since_id ポーリングして再接続ギャップ等の取りこぼしを埋める。
 * dedup は jobKey=mention:statusId で担保されるため streaming と併用しても安全。
 */
const mentionPoll: PeriodicJob = {
  name: "mention-poll",
  run: async () => {
    const instanceUrl = process.env.MASTODON_BOT_INSTANCE_URL || "";
    const accessToken = process.env.MASTODON_BOT_ACCESS_TOKEN || "";
    if (!accessToken || !instanceUrl) {
      console.warn(
        "[periodic] mention-poll skipped: MASTODON_BOT_INSTANCE_URL / MASTODON_BOT_ACCESS_TOKEN 未設定"
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
 * お気に入り情報のフォールバック sync。
 *
 * 通常お気に入りは画像詳細ページの GET（TTL切れ時）で同期されるが、詳細ページに
 * 一度もアクセスが無い投稿は取りこぼされる。それを定期的に拾うのがこのジョブ。
 *
 * 発火条件の正は isFavoriteSyncDue()（favoritePolicy.ts・ユニットテスト済み）。
 * 下の SQL はそれと同じ条件を DB 側で先に絞る最適化（バックカタログ全件ロード回避＋LIMIT）で、
 * 取得後に isFavoriteSyncDue() で最終ゲートする（SQL と TS が万一ズレても TS が正）。
 *
 * 発火タイミングは2つ（詳細は isFavoriteSyncDue のコメント参照）:
 *   - fire1: 1日経過後にまだ成功syncが無い → 投稿が落ち着いた頃のfavを1回拾う
 *   - fire2: 14日経過後にまだ「14日以降の成功sync」が無い → 成熟後の最終syncを1回拾い、以後停止
 * これにより、ページが一度も開かれない投稿でも day1 と day14 で各1回ずつ同期され、
 * 14日以降の成功syncが入った時点で（GET側の Infinity 停止と歩調を合わせて）恒久的に止まる。
 * 一時障害（429/5xx/接続失敗）は post_status≠200 のままなので、成功するか16日を超えるまで
 * 1日間隔で再試行される。429以外の4xx（deleted/forbidden 等）は回復見込みが薄いため再試行しない。
 * また投稿から16日を超えたら成功/失敗を問わず恒久停止する。
 */
const favoriteSyncJob: PeriodicJob = {
  name: "favorite-sync",
  run: async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM images
      WHERE ${FAVORITE_SYNC_WHERE}
      ORDER BY favorites_synced_at ASC NULLS FIRST
      LIMIT ${FAVORITE_SYNC_BATCH}
    `);
    if (rows.length === 0) return;

    // 取りこぼし可視化用の対象総数。LIMIT に達したときだけ COUNT で総数を数える
    // （上限未満なら取得分=全件なので、無駄な COUNT は走らせない）。
    let total = rows.length;
    if (rows.length === FAVORITE_SYNC_BATCH) {
      const [{ total: t }] = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM images WHERE ${FAVORITE_SYNC_WHERE}
      `);
      total = t;
    }

    // 本体は id ごとの findUnique（N+1）ではなく1クエリでまとめて取得する。
    // 抽出時の並び（favorites_synced_at ASC NULLS FIRST）は findMany では保証されないため、
    // 抽出順の id 配列で引き直して未同期・古い順を復元する。
    const ids = rows.map((r) => r.id);
    const found = await prisma.image.findMany({
      where: { id: { in: ids } },
      include: { user: { include: { instance: true } } },
    });
    const byId = new Map(found.map((img) => [img.id, img]));
    // 抽出〜ここまでに削除された行は map に無く、自然にスキップされる
    const images = ids
      .map((id) => byId.get(id))
      .filter((img): img is NonNullable<typeof img> => img !== undefined);

    // SQL 抽出時点と TS 判定時点で now がぶれないよう、1回だけ now を固定して使う
    const now = Date.now();
    let synced = 0;
    let failed = 0;
    // 連携先インスタンスへ一度に殺到させないよう、少数ずつ＋バッチ間ウェイトで回す
    for (let i = 0; i < images.length; i += FAVORITE_SYNC_CONCURRENCY) {
      if (i > 0) await sleep(FAVORITE_SYNC_GAP_MS);
      const chunk = images.slice(i, i + FAVORITE_SYNC_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (image) => {
          // 抽出〜実行の間に非公開化/削除された場合はスキップ（SQL 抽出時点では満たしていた）
          if (!image.isPublic || image.isDisabled || !image.postId) return null;
          // 発火条件の最終ゲート（isFavoriteSyncDue が正。SQL はあくまで前段の絞り込み）
          if (!isFavoriteSyncDue(image, now)) return null;
          // syncFavoriteCache は内部で例外を握り errorReason を返す（throw しない）。
          // 定期ジョブ経由は成功時に1行ログを残す（GET 経由は無音）
          return syncFavoriteCache(image, { logSuccess: true });
        })
      );
      for (const r of results) {
        if (r === null) continue;
        if (r.errorReason) failed++;
        else synced++;
      }
    }

    // 候補が1件以上あれば毎回サマリを返す（runPeriodicJobs が name と実行時間を合成して出す）。
    // candidates=処理対象/総数（総数は backlog）
    return `candidates=${rows.length}/${total} synced=${synced} failed=${failed}`;
  },
};

/**
 * 期限切れミュートの物理削除。
 *
 * ミュートの有効判定（expiresAt が null または未来）は参照側クエリで行うため、
 * 期限切れ行が残っていても表示・除外は正しく動く。この掃除は肥大防止のためのもので、
 * 遅れても実害は無い（次の30分周期で拾う）。無期（expiresAt=null）は削除しない。
 */
const muteCleanup: PeriodicJob = {
  name: "mute-cleanup",
  run: async () => {
    const { count } = await prisma.mute.deleteMany({
      where: { expiresAt: { not: null, lt: new Date() } },
    });
    if (count > 0) return `deleted=${count}`;
  },
};

/**
 * 実行する定期ジョブ一覧。先頭から順に実行される。
 *
 * 今後ここに足す予定（実装は別途）:
 *   - 定期判定でしか付与できない実績の判定
 */
const periodicJobs: PeriodicJob[] = [mentionPoll, tmpCleanup, favoriteSyncJob, muteCleanup];

/** 登録済みの定期ジョブ名一覧（手動実行スクリプトのフィルタ指定用）。 */
export const PERIODIC_JOB_NAMES = periodicJobs.map((j) => j.name);

/**
 * 定期ジョブを順に実行する。各ジョブの失敗は隔離され、他のジョブには波及しない。
 * @param only 指定時はこのジョブ名だけ実行する（手動実行で mention-poll/tmp-cleanup を巻き込まない用途）。
 */
export async function runPeriodicJobs(only?: string[]): Promise<void> {
  const jobs = only ? periodicJobs.filter((j) => only.includes(j.name)) : periodicJobs;
  for (const job of jobs) {
    const start = Date.now();
    try {
      const summary = await job.run();
      const ms = Date.now() - start;
      if (summary) {
        // サマリを返したジョブは name と実行時間を合成して1行で出す
        console.log(`[periodic] ${job.name}: ${summary} (${ms}ms)`);
      } else if (ms > 1000) {
        // サマリ無しのジョブは、遅かったときだけ実行時間を出す
        console.log(`[periodic] ${job.name} took ${ms}ms`);
      }
    } catch (err) {
      console.error(`[periodic] ${job.name} failed:`, err);
    }
  }
}
