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
import prisma from "@/lib/db";
import { syncFavoriteCache } from "@/lib/fediverse/favoriteSync";
import { isFavoriteSyncDue } from "@/lib/fediverse/favoritePolicy";

interface PeriodicJob {
  /** ログ識別用の名前 */
  name: string;
  run: () => Promise<void>;
}

/** tmp/* 一時ファイルを残留とみなすしきい値（30分） */
const TMP_MAX_AGE_MS = 30 * 60 * 1000;

/** お気に入りフォールバックsyncの1回あたり最大件数（初回展開時の thundering herd を防ぐ） */
const FAVORITE_SYNC_BATCH = 20;
/**
 * フォールバックsyncの同時実行数。まずは 1（逐次）で安全側に倒す。
 * 連携先インスタンスへの集中・レート制限の踏み抜きを避ける。負荷が問題化したら上げる。
 */
const FAVORITE_SYNC_CONCURRENCY = 1;

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
 * 失敗（4xx/5xx）は post_status≠200 のままなので、成功するまで12時間間隔で再試行され続ける。
 */
const favoriteSyncJob: PeriodicJob = {
  name: "favorite-sync",
  run: async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM images
      WHERE is_public = true
        AND is_disabled = false
        AND post_id IS NOT NULL
        AND created_at <= now() - interval '1 day'
        AND (favorites_synced_at IS NULL OR favorites_synced_at <= now() - interval '12 hours')
        AND (
          NOT COALESCE(
            post_status = 200 AND favorites_synced_at >= created_at + interval '1 day',
            false
          )
          OR (
            created_at <= now() - interval '14 days'
            AND NOT COALESCE(
              post_status = 200 AND favorites_synced_at >= created_at + interval '14 days',
              false
            )
          )
        )
      ORDER BY favorites_synced_at ASC NULLS FIRST
      LIMIT ${FAVORITE_SYNC_BATCH}
    `;
    if (rows.length === 0) return;

    // SQL 抽出時点と TS 判定時点で now がぶれないよう、1回だけ now を固定して使う
    const now = Date.now();
    let synced = 0;
    let failed = 0;
    // 連携先インスタンスへ一度に殺到させないよう、少数ずつ並列で回す
    for (let i = 0; i < rows.length; i += FAVORITE_SYNC_CONCURRENCY) {
      const chunk = rows.slice(i, i + FAVORITE_SYNC_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async ({ id }) => {
          const image = await prisma.image.findUnique({
            where: { id },
            include: { user: { include: { instance: true } } },
          });
          // 取得〜選別の間に削除/非公開化された場合はスキップ
          if (!image || !image.isPublic || image.isDisabled || !image.postId) {
            return null;
          }
          // 発火条件の最終ゲート（isFavoriteSyncDue が正。SQL はあくまで前段の絞り込み）
          if (!isFavoriteSyncDue(image, now)) return null;
          // syncFavoriteCache は内部で例外を握り errorReason を返す（throw しない）
          return syncFavoriteCache(image);
        })
      );
      for (const r of results) {
        if (r === null) continue;
        if (r.errorReason) failed++;
        else synced++;
      }
    }

    if (synced || failed) {
      console.log(
        `[periodic] favorite-sync: candidates=${rows.length} synced=${synced} failed=${failed}`
      );
    }
  },
};

/**
 * 実行する定期ジョブ一覧。先頭から順に実行される。
 *
 * 今後ここに足す予定（実装は別途）:
 *   - 定期判定でしか付与できない実績の判定
 */
const periodicJobs: PeriodicJob[] = [mentionPoll, tmpCleanup, favoriteSyncJob];

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
